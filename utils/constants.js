// 饮品分类（点单页按此分组）
const CATEGORIES = [
  { key: 'espresso', label: '浓缩', icon: '☕' },
  { key: 'milk', label: '奶咖', icon: '🥛' },
  { key: 'filter', label: '手冲', icon: '🌊' },
  { key: 'cold', label: '冷饮', icon: '🧊' },
  { key: 'special', label: '特调', icon: '✨' },
  { key: 'other', label: '其他', icon: '🍮' }
]

// 冲煮器具
const TOOLS = [
  { key: 'machine', label: '意式咖啡机' },
  { key: 'hand_drip', label: '手冲壶' },
  { key: 'french_press', label: '法压壶' },
  { key: 'aeropress', label: '爱乐压' },
  { key: 'moka', label: '摩卡壶' },
  { key: 'cold_brew', label: '冷萃瓶' },
  { key: 'siphon', label: '虹吸壶' },
  { key: 'capsule', label: '胶囊机' },
  { key: 'other', label: '其他' }
]

// 烘焙度
const ROASTS = [
  { key: 'light', label: '浅烘' },
  { key: 'medium', label: '中烘' },
  { key: 'medium_dark', label: '中深烘' },
  { key: 'dark', label: '深烘' }
]

// 研磨度
const GRINDS = ['极细', '细', '中细', '中度', '中粗', '粗']

// 处理法
const PROCESSES = ['水洗', '日晒', '蜜处理', '厌氧发酵', '湿刨', '其他']

/* ---------------- 咖啡豆「用途标签」（可多选） ----------------
 * 解决「手冲豆不该出现在奶咖里」：豆标注用途，配方声明所需用途，下单时只列匹配的豆。
 */
const USAGE_TAGS = [
  { key: 'espresso', label: '意式', tip: '适合意式机/摩卡壶，中深烘以上' },
  { key: 'filter', label: '手冲', tip: '适合手冲/虹吸/法压，浅中烘' },
  { key: 'cold_brew', label: '冷萃', tip: '适合冷萃，中粗研磨' },
  { key: 'universal', label: '通用', tip: '什么器具都能用' }
]

// 配方声明的「所需豆用途」
const BEAN_TYPES = [
  { key: 'espresso', label: '意式豆', hint: '浓缩 / 奶咖' },
  { key: 'filter', label: '手冲豆', hint: '手冲 / 虹吸 / 法压' },
  { key: 'cold_brew', label: '冷萃豆', hint: '冷萃 / 冰滴' },
  { key: 'any', label: '不限', hint: '豆仓里所有豆都可选' }
]

// 用途兼容表：配方需要 X 时，哪些标签的豆可以被选出来
// 冷萃配方额外接受「手冲」豆——冷萃本来就用浅中烘的手冲豆
const USAGE_COMPAT = {
  espresso: ['espresso', 'universal'],
  filter: ['filter', 'universal'],
  cold_brew: ['cold_brew', 'filter', 'universal'],
  any: ['espresso', 'filter', 'cold_brew', 'universal']
}

// 器具 → 所需豆用途（优先按器具判断，器具判断不出来再按分类）
const TOOL_BEAN_TYPE = {
  machine: 'espresso',
  capsule: 'espresso',
  moka: 'espresso',
  hand_drip: 'filter',
  siphon: 'filter',
  french_press: 'filter',
  aeropress: 'filter',
  cold_brew: 'cold_brew'
}

// 分类 → 所需豆用途（兜底）
const CATEGORY_BEAN_TYPE = {
  espresso: 'espresso',
  milk: 'espresso',
  filter: 'filter',
  cold: 'cold_brew',
  special: 'any',
  other: 'any'
}

// 预置风味标签（风味轮常见描述，bean-edit 里点选）
const PRESET_FLAVORS = [
  '柑橘', '柠檬', '莓果', '葡萄', '苹果', '热带水果',
  '茉莉', '花香', '蜂蜜', '焦糖', '红糖',
  '坚果', '杏仁', '巧克力', '可可',
  '奶油', '麦芽', '木质', '烟熏', '酒香', '香料'
]

// 预置产地（bean-edit 里点选，避免「埃塞」/「埃塞俄比亚」变成两个产地）
const PRESET_ORIGINS = [
  '埃塞俄比亚', '肯尼亚', '卢旺达', '哥伦比亚', '巴西',
  '危地马拉', '哥斯达黎加', '巴拿马', '洪都拉斯', '秘鲁',
  '印尼', '云南', '也门', '墨西哥', '拼配'
]

// 预置配方标签（点单选，也允许自定义）
const PRESET_RECIPE_TAGS = [
  '日常', '提神', '咖啡感强', '奶感重', '清爽',
  '果酸', '甜感', '解腻', '夏天', '冬天',
  '早餐', '下午茶', '招待客人', '快手'
]

// 预置冲煮时长（点单选，格式统一，冲煮计时器才好解析）
const PRESET_TIMES = ['22s', '25s', '28s', '30s', '2:00', '2:30', '3:00', '4:00']

// 咖啡豆默认参数（天）
const BEAN_DEFAULTS = {
  restDays: 7, // 养豆期
  peakDays: 45, // 最佳风味期（自烘焙日起）
  shelfDays: 90 // 保质期
}

// 剩余量低于此比例视为「该补货了」
const LOW_STOCK_RATIO = 0.15

function labelOf(list, key) {
  const hit = list.find(function (i) { return i.key === key })
  return hit ? hit.label : '未设置'
}

function categoryOf(key) {
  return CATEGORIES.find(function (i) { return i.key === key }) || { key: key, label: '其他', icon: '🍮' }
}

function usageLabel(key) {
  return labelOf(USAGE_TAGS, key)
}

function beanTypeLabel(key) {
  return labelOf(BEAN_TYPES, key)
}

/**
 * 推导一个配方「需要什么用途的豆」。
 * 优先看器具，器具判断不出来再看分类，都没有就不限。
 * @param {Object} recipe
 * @returns {'espresso'|'filter'|'cold_brew'|'any'}
 */
function inferBeanType(recipe) {
  if (!recipe) return 'any'
  if (recipe.beanType) return recipe.beanType // 手动指定优先
  const byTool = TOOL_BEAN_TYPE[recipe.tool]
  if (byTool) return byTool
  return CATEGORY_BEAN_TYPE[recipe.category] || 'any'
}

/**
 * 判断一支豆能不能用于某个所需用途。
 * - 豆没标用途标签 → 视为「未标注」，仍然列出（避免历史数据全部消失），由界面提示去补标
 * - 豆标了标签 → 需与兼容表有交集
 * @returns {{ok: boolean, unlabeled: boolean}}
 */
function beanMatchesType(bean, beanType) {
  const need = beanType || 'any'
  const tags = (bean && bean.usageTags) || []
  if (!tags.length) return { ok: true, unlabeled: true }
  const allow = USAGE_COMPAT[need] || USAGE_COMPAT.any
  const ok = tags.some(function (t) { return allow.indexOf(t) > -1 })
  return { ok: ok, unlabeled: false }
}

module.exports = {
  CATEGORIES: CATEGORIES,
  TOOLS: TOOLS,
  ROASTS: ROASTS,
  GRINDS: GRINDS,
  PROCESSES: PROCESSES,
  USAGE_TAGS: USAGE_TAGS,
  BEAN_TYPES: BEAN_TYPES,
  USAGE_COMPAT: USAGE_COMPAT,
  PRESET_FLAVORS: PRESET_FLAVORS,
  PRESET_ORIGINS: PRESET_ORIGINS,
  PRESET_RECIPE_TAGS: PRESET_RECIPE_TAGS,
  PRESET_TIMES: PRESET_TIMES,
  BEAN_DEFAULTS: BEAN_DEFAULTS,
  LOW_STOCK_RATIO: LOW_STOCK_RATIO,
  labelOf: labelOf,
  categoryOf: categoryOf,
  usageLabel: usageLabel,
  beanTypeLabel: beanTypeLabel,
  inferBeanType: inferBeanType,
  beanMatchesType: beanMatchesType
}
