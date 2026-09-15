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

// 咖啡豆默认参数（天）
const BEAN_DEFAULTS = {
  restDays: 7, // 养豆期
  peakDays: 45, // 最佳风味期（自烘焙日起）
  shelfDays: 90 // 保质期
}

function labelOf(list, key) {
  const hit = list.find(function (i) { return i.key === key })
  return hit ? hit.label : '未设置'
}

function categoryOf(key) {
  return CATEGORIES.find(function (i) { return i.key === key }) || { key: key, label: '其他', icon: '🍮' }
}

module.exports = {
  CATEGORIES: CATEGORIES,
  TOOLS: TOOLS,
  ROASTS: ROASTS,
  GRINDS: GRINDS,
  PROCESSES: PROCESSES,
  BEAN_DEFAULTS: BEAN_DEFAULTS,
  labelOf: labelOf,
  categoryOf: categoryOf
}
