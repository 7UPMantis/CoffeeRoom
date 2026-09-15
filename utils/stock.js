/**
 * 咖啡豆消耗闭环。
 *
 * 之前「点单」和「咖啡豆余量」是两套独立数据，点完单豆量纹丝不动，
 * 本模块把两者接起来：
 *   1. planUsage(items)     —— 下单前预估：这次点单要消耗哪些豆、各多少克、够不够
 *   2. applyUsage(plan)     —— 落库扣减，返回真正扣掉的用量（写进订单，便于回补）
 *   3. restoreUsage(usage)  —— 删除订单时按记录回补余量
 *
 * 订单新增可选字段 beanUsage: [{ beanId, beanName, grams }]
 * 历史订单没有该字段，删除时不回补（不影响使用）。
 */
const store = require('./store.js')

function toNum(v, d) {
  const n = Number(v)
  return isNaN(n) ? d : n
}

/**
 * 预估一次点单的咖啡豆消耗。
 * @param {Array} items [{ recipeId, name, count }]
 * @returns {Promise<{plan:Array, detail:Array, unlinked:Array}>}
 *   plan     [{ beanId, beanName, grams, before, total, missing, shortage }] 按豆聚合
 *   detail   [{ recipeName, count, beanId, beanName, grams }] 按款明细
 *   unlinked [配方名] 没关联咖啡豆或没填用量的款（不参与扣减）
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
      const dose = r ? toNum(r.dose, 0) : 0
      if (!r || !r.beanId || !dose || !count) {
        unlinked.push((r && r.name) || it.name || '未知配方')
        return
      }
      const grams = dose * count
      agg[r.beanId] = (agg[r.beanId] || 0) + grams
      detail.push({
        recipeName: r.name,
        count: count,
        beanId: r.beanId,
        beanName: r.beanName || '',
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
  planUsage: planUsage,
  applyUsage: applyUsage,
  restoreUsage: restoreUsage,
  usageText: usageText
}
