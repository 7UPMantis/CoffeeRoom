/**
 * 咖啡豆消耗闭环 + 选豆匹配。
 *
 * 职责：
 *   1. beansFor(recipe, beans)  —— 按配方「所需豆用途」筛出可选豆（解决手冲豆出现在奶咖里）
 *   2. planUsage(items)         —— 下单前预估：这次点单要消耗哪些豆、各多少克、够不够
 *   3. applyUsage(plan)         —— 落库扣减，返回真正扣掉的用量（写进订单，便于回补）
 *   4. restoreUsage(usage)      —— 删除订单时按记录回补余量
 *
 * 订单结构（v1.2 起）：
 *   items: [{ recipeId, name, count, beanId, beanName, dose }]   ← 豆在下单时确定
 *   beanUsage: [{ beanId, beanName, grams }]                     ← 用于回补
 * 历史订单缺少 beanId/dose 时，planUsage 会回退到配方上的默认值，保证兼容。
 */
const store = require('./store.js')
const C = require('./constants.js')

function toNum(v, d) {
  const n = Number(v)
  return isNaN(n) ? d : n
}

/**
 * 按配方的「所需豆用途」筛出豆仓里可选的豆。
 * 未标注用途的豆也会列出（否则历史数据会全都消失），但排在最后并带 _unlabeled 标记，
 * 由界面提示去补标用途。
 *
 * 排序：专用豆（用途精确命中）→ 通用豆 → 未标注；同组内余量多的在前。
 * @returns {Array} 复制后的豆对象，附带 _unlabeled / _exact
 */
function beansFor(recipe, beans) {
  const need = C.inferBeanType(recipe)
  const out = []
  ;(beans || []).forEach(function (b) {
    const m = C.beanMatchesType(b, need)
    if (!m.ok) return
    const tags = b.usageTags || []
    out.push(Object.assign({}, b, {
      _unlabeled: m.unlabeled,
      _exact: !m.unlabeled && need !== 'any' && tags.indexOf(need) > -1
    }))
  })
  out.sort(function (a, b) {
    if (a._unlabeled !== b._unlabeled) return a._unlabeled ? 1 : -1
    if (a._exact !== b._exact) return a._exact ? -1 : 1
    return toNum(b.remaining, 0) - toNum(a.remaining, 0)
  })
  return out
}

/**
 * 预估一次点单的咖啡豆消耗。
 * @param {Array} items [{ recipeId, name, count, beanId?, beanName?, dose? }]
 * @returns {Promise<{plan:Array, detail:Array, unlinked:Array}>}
 *   plan     [{ beanId, beanName, grams, before, total, missing, shortage }] 按豆聚合
 *   detail   [{ recipeName, count, beanId, beanName, grams }] 按款明细
 *   unlinked [饮品名] 没选豆或没填用量的款（不参与扣减）
 */
function planUsage(items) {
  const list = items || []
  return store.recipes.list().then(function (recipes) {
    const rmap = {}
    recipes.forEach(function (r) { rmap[r._id] = r })

    const agg = {} // beanId -> 累计克数
    const detail = []
    const unlinked = []

    list.forEach(function (it) {
      const r = rmap[it.recipeId]
      const count = toNum(it.count, 0)
      // 下单时选定的豆优先；没有则回退到配方默认豆（兼容旧数据）
      const beanId = it.beanId || (r && r.beanId) || ''
      const dose = (it.dose !== undefined && it.dose !== '' && it.dose !== null)
        ? toNum(it.dose, 0)
        : (r ? toNum(r.dose, 0) : 0)
      const beanName = it.beanName || (r && r.beanName) || ''

      if (!beanId || !dose || !count) {
        unlinked.push((r && r.name) || it.name || '未知饮品')
        return
      }
      const grams = dose * count
      agg[beanId] = (agg[beanId] || 0) + grams
      detail.push({
        recipeName: (r && r.name) || it.name,
        count: count,
        beanId: beanId,
        beanName: beanName,
        grams: grams
      })
    })

    const beanIds = Object.keys(agg)
    if (!beanIds.length) return { plan: [], detail: detail, unlinked: unlinked }

    return store.beans.list().then(function (beans) {
      const bmap = {}
      beans.forEach(function (b) { bmap[b._id] = b })
      const plan = beanIds.map(function (id) {
        const b = bmap[id]
        const before = b ? toNum(b.remaining, 0) : 0
        const hit = detail.filter(function (d) { return d.beanId === id })[0] || {}
        return {
          beanId: id,
          beanName: b ? b.name : (hit.beanName || '已删除的豆'),
          grams: agg[id],
          before: before,
          total: b ? toNum(b.weight, 0) : 0,
          missing: !b,
          shortage: Math.max(0, agg[id] - before)
        }
      })
      return { plan: plan, detail: detail, unlinked: unlinked }
    })
  })
}

/**
 * 执行扣减。豆已被删除的条目跳过（无法扣也无法回补）。
 * @returns {Promise<Array>} 真正落库的用量 [{ beanId, beanName, grams }]
 */
function applyUsage(plan) {
  const usage = []
  const tasks = []
  ;(plan || []).forEach(function (p) {
    if (p.missing) return
    const after = Math.max(0, toNum(p.before, 0) - toNum(p.grams, 0))
    usage.push({ beanId: p.beanId, beanName: p.beanName, grams: toNum(p.grams, 0) })
    tasks.push(store.beans.update(p.beanId, { remaining: after }))
  })
  return Promise.all(tasks).then(function () { return usage })
}

/**
 * 按订单记录的用量回补余量（以 weight 为上限，避免超过总量）。
 * @param {Array} usage [{ beanId, grams }]
 */
function restoreUsage(usage) {
  const list = usage || []
  if (!list.length) return Promise.resolve([])
  return store.beans.list().then(function (beans) {
    const bmap = {}
    beans.forEach(function (b) { bmap[b._id] = b })
    const tasks = []
    list.forEach(function (u) {
      const b = bmap[u.beanId]
      if (!b) return
      const total = toNum(b.weight, 0)
      const cur = toNum(b.remaining, 0)
      const next = total > 0 ? Math.min(total, cur + toNum(u.grams, 0)) : (cur + toNum(u.grams, 0))
      tasks.push(store.beans.update(u.beanId, { remaining: next }))
    })
    return Promise.all(tasks)
  })
}

/** 把用量数组压成一句人话，用于 toast / 记录展示 */
function usageText(usage) {
  const list = usage || []
  if (!list.length) return ''
  return list.map(function (u) {
    return u.beanName + ' −' + Math.round(u.grams) + 'g'
  }).join('，')
}

module.exports = {
  beansFor: beansFor,
  planUsage: planUsage,
  applyUsage: applyUsage,
  restoreUsage: restoreUsage,
  usageText: usageText
}
