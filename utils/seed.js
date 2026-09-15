const store = require('./store.js')

// 首次使用的示例数据：3 支豆 + 5 个配方，方便立刻看到效果
// usageTags 决定这支豆会出现在哪些配方里（意式/手冲/冷萃/通用）
const BEANS = [
  {
    name: '耶加雪菲 科契尔',
    origin: '埃塞俄比亚',
    process: '水洗',
    roast: 'light',
    roastDateOffset: -12,
    weight: 250,
    remaining: 180,
    price: 98,
    usageTags: ['filter'],
    flavor: ['柑橘', '茉莉', '蜂蜜'],
    note: '浅烘，手冲首选，水温 92℃ 表现最好'
  },
  {
    name: '哥伦比亚 慧兰',
    origin: '哥伦比亚',
    process: '水洗',
    roast: 'medium_dark',
    roastDateOffset: -3,
    weight: 500,
    remaining: 460,
    price: 128,
    usageTags: ['espresso'],
    flavor: ['坚果', '焦糖', '巧克力'],
    note: '奶咖基底，配牛奶很稳'
  },
  {
    name: '巴西 圣多斯 拼配',
    origin: '拼配',
    process: '日晒',
    roast: 'dark',
    roastDateOffset: -25,
    weight: 500,
    remaining: 320,
    price: 88,
    usageTags: ['universal'],
    flavor: ['坚果', '可可', '烟熏'],
    note: '通用口粮豆，意式和冷萃都能顶'
  }
]

const RECIPES = [
  {
    name: '经典拿铁',
    category: 'milk',
    tool: 'machine',
    beanName: '哥伦比亚 慧兰',
    dose: 18,
    water: 36,
    milk: 220,
    grind: '细',
    temp: 92,
    time: '25-28s',
    steps: ['18g 咖啡粉布粉压平', '萃取 36g 浓缩液，25-28 秒', '牛奶打发至 60℃ 左右', '浓缩倒入杯中，缓慢注入奶泡'],
    tags: ['日常', '奶咖'],
    favorite: true
  },
  {
    name: '澳白 Flat White',
    category: 'milk',
    tool: 'machine',
    beanName: '哥伦比亚 慧兰',
    dose: 18,
    water: 30,
    milk: 130,
    grind: '细',
    temp: 92,
    time: '25s',
    steps: ['萃取 30g 浓缩（ristretto 风味更集中）', '牛奶打薄奶泡，约 0.5cm', '贴杯壁注入，收尾拉花'],
    tags: ['咖啡感强'],
    favorite: false
  },
  {
    name: '手冲耶加',
    category: 'filter',
    tool: 'hand_drip',
    beanName: '耶加雪菲 科契尔',
    dose: 15,
    water: 240,
    milk: 0,
    grind: '中细',
    temp: 92,
    time: '2:30',
    steps: ['滤纸润湿温杯', '15g 粉，注入 30g 水闷蒸 30 秒', '分三次注水至 240g', '总时长控制在 2 分 30 秒左右'],
    tags: ['果酸', '慢手冲'],
    favorite: true
  },
  {
    name: '冰美式',
    category: 'cold',
    tool: 'machine',
    beanName: '哥伦比亚 慧兰',
    dose: 18,
    water: 36,
    milk: 0,
    grind: '细',
    temp: 92,
    time: '25s',
    steps: ['杯中加满冰块', '萃取 36g 浓缩直接淋在冰上', '补 120ml 冷水，搅匀'],
    tags: ['夏天', '解腻'],
    favorite: false
  },
  {
    name: '浓缩 Espresso',
    category: 'espresso',
    tool: 'machine',
    beanName: '哥伦比亚 慧兰',
    dose: 20,
    water: 40,
    milk: 0,
    grind: '细',
    temp: 93,
    time: '28s',
    steps: ['20g 粉萃取 40g 液', '观察油脂颜色与流速', '30 秒内饮用风味最佳'],
    tags: ['基础', '提神'],
    favorite: false
  },
  {
    name: '冷萃咖啡',
    category: 'cold',
    tool: 'cold_brew',
    beanName: '巴西 圣多斯 拼配',
    dose: 40,
    water: 400,
    milk: 0,
    grind: '粗',
    temp: 0,
    time: '4:00',
    steps: ['40g 粗研磨咖啡粉放入冷萃瓶', '注入 400g 常温水，轻轻搅拌', '冷藏静置 12 小时', '滤出咖啡液，冷藏可存 3 天'],
    tags: ['夏天', '解腻', '清爽'],
    favorite: false
  }
]

function offsetDate(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  const p = function (x) { return x < 10 ? '0' + x : '' + x }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

function run() {
  const BEAN_DEFAULTS = require('./constants.js').BEAN_DEFAULTS
  const beanIds = {}

  return store.beans.list().then(function (list) {
    if (list.length) return Promise.resolve(null) // 已有数据就不重复灌入
    return BEANS.reduce(function (chain, b) {
      return chain.then(function () {
        return store.beans.add({
          name: b.name,
          origin: b.origin,
          process: b.process,
          roast: b.roast,
          roastDate: offsetDate(b.roastDateOffset),
          restDays: BEAN_DEFAULTS.restDays,
          peakDays: BEAN_DEFAULTS.peakDays,
          shelfDays: BEAN_DEFAULTS.shelfDays,
          weight: b.weight,
          remaining: b.remaining,
          price: b.price,
          usageTags: b.usageTags || [],
          flavor: b.flavor,
          note: b.note
        }).then(function (id) { beanIds[b.beanName || b.name] = id })
      })
    }, Promise.resolve())
  }).then(function () {
    return store.recipes.list()
  }).then(function (list) {
    if (list.length) return null
    return RECIPES.reduce(function (chain, r) {
      return chain.then(function () {
        return store.recipes.add({
          name: r.name,
          category: r.category,
          tool: r.tool,
          beanType: r.beanType || '',
          beanId: beanIds[r.beanName] || '',
          beanName: r.beanName,
          dose: r.dose,
          water: r.water,
          milk: r.milk,
          grind: r.grind,
          temp: r.temp,
          time: r.time,
          steps: r.steps,
          tags: r.tags,
          favorite: r.favorite,
          note: ''
        })
      })
    }, Promise.resolve())
  })
}

module.exports = { run: run }
