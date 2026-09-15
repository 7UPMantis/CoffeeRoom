/**
 * 本地开发脚本，不属于小程序包（已在 project.config.json 的 packOptions.ignore 中排除）。
 * 原来的 shebang 行已移除：小程序编译器会解析 miniprogramRoot 下的所有 .js，
 * 遇到 #! 会报 SyntaxError: Invalid or unexpected token，导致上传失败。
 * 用法：node scripts/test-logic.js
 */
/**
 * 业务逻辑测试（不需要微信开发者工具）。
 *
 * 自检脚本只能抓语法/引用类问题，抓不到「选豆筛不筛得对」「豆扣没扣」。
 * 这个脚本用 Storage mock 顶住 wx 接口，把 utils 层跑起来做真实断言：
 *   1. inferBeanType    —— 配方该需要什么用途的豆
 *   2. beanMatchesType  —— 手冲豆会不会跑进奶咖
 *   3. beansFor         —— 下单时列出的可选豆对不对
 *   4. 下单闭环         —— 选豆 → 扣减 → 回补，克数是否自洽
 *   5. parseDuration    —— 时长解析（计时器依赖它）
 *
 * 用法：node scripts/test-logic.js   退出码 0 = 全通过
 */
const path = require('path')

/* ---------- wx / getApp mock：让 store.js 走本地存储分支 ---------- */
const storage = {}
global.wx = {
  getStorageSync(k) { return storage[k] },
  setStorageSync(k, v) { storage[k] = v },
  cloud: undefined
}
global.getApp = function () {
  return { globalData: { envId: '', mode: 'local', cloudReady: false } }
}

const ROOT = path.resolve(__dirname, '..')
const C = require(path.join(ROOT, 'utils/constants.js'))
const util = require(path.join(ROOT, 'utils/util.js'))
const store = require(path.join(ROOT, 'utils/store.js'))
const stock = require(path.join(ROOT, 'utils/stock.js'))

let pass = 0
let fail = 0
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.error('  ✗ ' + name + (extra ? '  -> ' + extra : '')) }
}
function eq(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  ok(name, a === e, 'actual=' + a + ' expected=' + e)
}
function section(t) { console.log('\n' + t) }

/* ---------- 1. inferBeanType ---------- */
section('1. 配方所需豆用途推导 (inferBeanType)')
eq('奶咖 + 意式机 → 意式豆', C.inferBeanType({ category: 'milk', tool: 'machine' }), 'espresso')
eq('手冲 + 手冲壶 → 手冲豆', C.inferBeanType({ category: 'filter', tool: 'hand_drip' }), 'filter')
eq('冷饮 + 冷萃瓶 → 冷萃豆', C.inferBeanType({ category: 'cold', tool: 'cold_brew' }), 'cold_brew')
eq('冷饮 + 意式机 → 意式豆（器具优先于分类）', C.inferBeanType({ category: 'cold', tool: 'machine' }), 'espresso')
eq('特调 + 其他 → 不限', C.inferBeanType({ category: 'special', tool: 'other' }), 'any')
eq('手动指定优先于推导', C.inferBeanType({ category: 'milk', tool: 'machine', beanType: 'filter' }), 'filter')

/* ---------- 2. beanMatchesType ---------- */
section('2. 豆与用途的匹配 (beanMatchesType)')
const filterBean = { name: '耶加', usageTags: ['filter'] }
const espressoBean = { name: '慧兰', usageTags: ['espresso'] }
const universalBean = { name: '拼配', usageTags: ['universal'] }
const unlabeledBean = { name: '没标' }

ok('手冲豆 ✗ 意式配方', C.beanMatchesType(filterBean, 'espresso').ok === false)
ok('手冲豆 ✓ 手冲配方', C.beanMatchesType(filterBean, 'filter').ok === true)
ok('意式豆 ✗ 手冲配方', C.beanMatchesType(espressoBean, 'filter').ok === false)
ok('意式豆 ✓ 意式配方', C.beanMatchesType(espressoBean, 'espresso').ok === true)
ok('通用豆 ✓ 意式配方', C.beanMatchesType(universalBean, 'espresso').ok === true)
ok('通用豆 ✓ 手冲配方', C.beanMatchesType(universalBean, 'filter').ok === true)
ok('手冲豆 ✓ 冷萃配方（冷萃接受手冲豆）', C.beanMatchesType(filterBean, 'cold_brew').ok === true)
ok('不限 ✓ 任何豆', C.beanMatchesType(espressoBean, 'any').ok === true)
const um = C.beanMatchesType(unlabeledBean, 'espresso')
ok('未标注用途的豆仍然列出，但带 unlabeled 标记', um.ok === true && um.unlabeled === true)

/* ---------- 3. beansFor ---------- */
section('3. 下单时列出的可选豆 (beansFor)')
const beanPool = [
  { _id: 'b1', name: '耶加雪菲', roast: 'light', usageTags: ['filter'], remaining: 180 },
  { _id: 'b2', name: '哥伦比亚 慧兰', roast: 'medium_dark', usageTags: ['espresso'], remaining: 460 },
  { _id: 'b3', name: '巴西 拼配', roast: 'dark', usageTags: ['universal'], remaining: 320 },
  { _id: 'b4', name: '没标用途的豆', roast: 'medium', usageTags: [], remaining: 100 }
]
const pick4Filter = stock.beansFor({ category: 'filter', tool: 'hand_drip' }, beanPool)
eq('手冲配方可选豆 = 专用手冲豆 → 通用豆 → 未标注', pick4Filter.map(b => b._id), ['b1', 'b3', 'b4'])
ok('专用手冲豆被标为精确匹配', pick4Filter[0]._exact === true)
ok('通用豆不是精确匹配（排在专用豆后面）', pick4Filter[1]._exact === false && pick4Filter[1].name === '巴西 拼配')
ok('未标注豆排最后并带标记', pick4Filter[2]._unlabeled === true)
const pick4Milk = stock.beansFor({ category: 'milk', tool: 'machine' }, beanPool).map(b => b._id)
eq('奶咖可选豆 = 意式 + 通用 + 未标注（不含手冲豆）', pick4Milk, ['b2', 'b3', 'b4'])
ok('手冲豆没有出现在奶咖的可选豆里', pick4Milk.indexOf('b1') === -1)
const pick4Any = stock.beansFor({ category: 'special', tool: 'other', beanType: 'any' }, beanPool).map(b => b._id)
eq('不限用途时四支豆都能选', pick4Any.sort(), ['b1', 'b2', 'b3', 'b4'])

// 选豆交互降级：豆仓通常只有 2-3 支，候选数决定要不要渲染选择器
// （order.js 用 beansFor 的长度判断：1 → 只读展示，≥2 → 选择器）
ok('候选只有 1 支时长度=1，页面应降级为只读展示',
  stock.beansFor({ category: 'filter', tool: 'hand_drip' }, [beanPool[0]]).length === 1)
ok('候选 ≥2 支时页面才渲染选择器',
  stock.beansFor({ category: 'filter', tool: 'hand_drip' }, beanPool).length >= 2)

/* ---------- 4. 下单闭环：选豆 → 扣减 → 回补 ---------- */
section('4. 下单闭环（选豆 / 扣豆 / 回补）')
store.beans.add({ name: '哥伦比亚 慧兰', weight: 500, remaining: 460, usageTags: ['espresso'] })
store.beans.add({ name: '耶加雪菲 科契尔', weight: 250, remaining: 180, usageTags: ['filter'] })
store.recipes.add({ name: '经典拿铁', category: 'milk', tool: 'machine', dose: 18, beanType: '' })
store.recipes.add({ name: '手冲耶加', category: 'filter', tool: 'hand_drip', dose: 15, beanType: '' })

store.beans.list().then(function (beans) {
  return store.recipes.list().then(function (recipes) {
    const espresso = beans.filter(b => b.usageTags.indexOf('espresso') > -1)[0]
    const latte = recipes.filter(r => r.name === '经典拿铁')[0]

    // 下单人给拿铁选了「意式豆」，做 2 杯
    const items = [{
      recipeId: latte._id, name: latte.name, count: 2,
      beanId: espresso._id, beanName: espresso.name, dose: 18
    }]

    return stock.planUsage(items).then(function (calc) {
      eq('2 杯拿铁 × 18g = 36g', calc.plan[0].grams, 36)
      eq('聚合到正确的豆', calc.plan[0].beanId, espresso._id)
      eq('没有未关联豆的款', calc.unlinked, [])
      ok('余量充足，shortage 为 0', calc.plan[0].shortage === 0)

      return stock.applyUsage(calc.plan).then(function (usage) {
        eq('落库用量记录 = 36g', usage[0].grams, 36)
        return store.beans.get(espresso._id).then(function (after) {
          eq('扣减后余量 460 - 36 = 424', after.remaining, 424)

          // 删单回补
          return stock.restoreUsage(usage).then(function () {
            return store.beans.get(espresso._id).then(function (back) {
              eq('回补后余量回到 460', back.remaining, 460)

              // 回补不得溢出 weight
              return stock.restoreUsage([{ beanId: espresso._id, grams: 9999 }]).then(function () {
                return store.beans.get(espresso._id).then(function (capped) {
                  eq('回补以 weight 为上限，不会超过 500', capped.remaining, 500)
                  runShortageTest(beans, recipes)
                })
              })
            })
          })
        })
      })
    })
  })
}).catch(function (e) {
  fail++
  console.error('  ✗ 闭环测试抛异常: ' + (e && e.message))
  summary()
})

/* ---------- 5. 豆不够时的 shortage ---------- */
function runShortageTest(beans, recipes) {
  section('5. 豆量不足的判定（下单前的安全网）')
  const espresso = beans.filter(b => b.usageTags.indexOf('espresso') > -1)[0]
  const latte = recipes.filter(r => r.name === '经典拿铁')[0]
  // 先把它压到只剩 10g
  store.beans.update(espresso._id, { remaining: 10 }).then(function () {
    const items = [{
      recipeId: latte._id, name: latte.name, count: 2,
      beanId: espresso._id, beanName: espresso.name, dose: 18
    }]
    return stock.planUsage(items).then(function (calc) {
      eq('需要 36g，只剩 10g → 缺口 26g', calc.plan[0].shortage, 26)
      ok('缺口 > 0，前端会弹二次确认', calc.plan[0].shortage > 0)
      runDurationTest()
    })
  })
}

/* ---------- 6. 时长解析 ---------- */
function runDurationTest() {
  section('6. 冲煮时长解析（计时器依赖）')
  eq('"2:30" → 150 秒', util.parseDuration('2:30'), 150)
  eq('"25s" → 25 秒', util.parseDuration('25s'), 25)
  eq('"25-28s" → 取左端 25 秒', util.parseDuration('25-28s'), 25)
  eq('"2:30-3:00" → 取左端 150 秒', util.parseDuration('2:30-3:00'), 150)
  eq('"4:00" → 240 秒', util.parseDuration('4:00'), 240)
  eq('空字符串 → 0（调用方回退默认值）', util.parseDuration(''), 0)
  eq('乱填 "abc" → 0', util.parseDuration('abc'), 0)

  section('7. 未关联豆的款不参与扣减')
  return store.recipes.add({ name: '肉桂特调', category: 'special', tool: 'moka', dose: 0, beanType: '' })
    .then(function () {
      return store.recipes.list()
    })
    .then(function (recipes) {
      const t = recipes.filter(r => r.name === '肉桂特调')[0]
      return stock.planUsage([{ recipeId: t._id, name: t.name, count: 1, beanId: '', beanName: '', dose: 0 }])
        .then(function (calc) {
          eq('没选豆的款 → 进 unlinked', calc.unlinked, ['肉桂特调'])
          eq('该款不进扣减计划', calc.plan.length, 0)
          summary()
        })
    })
}

function summary() {
  console.log('\n' + '─'.repeat(46))
  console.log(`通过 ${pass} 项，失败 ${fail} 项`)
  if (fail) {
    console.error('有测试未通过')
    process.exit(1)
  }
  console.log('✓ 全部逻辑测试通过')
  process.exit(0)
}
