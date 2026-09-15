const BEAN_DEFAULTS = require('./constants.js').BEAN_DEFAULTS
const LOW_STOCK_RATIO = require('./constants.js').LOW_STOCK_RATIO

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

// Date -> 'YYYY-MM-DD'
function dateStr(d) {
  const dt = d ? new Date(d) : new Date()
  return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate())
}

// 时间戳 -> 'MM-DD HH:mm'
function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// 时间戳 -> 'YYYY-MM-DD HH:mm'
function formatFull(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return dateStr(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// 'YYYY-MM-DD' 距今多少天（负数表示未来）
function daysSince(str) {
  if (!str) return null
  const parts = String(str).split('-')
  if (parts.length < 3) return null
  const target = new Date(+parts[0], +parts[1] - 1, +parts[2])
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.round((today - target) / 86400000)
}

// 从烘焙日推算第 n 天的日期字符串
function addDays(str, n) {
  const parts = String(str).split('-')
  const d = new Date(+parts[0], +parts[1] - 1, +parts[2])
  d.setDate(d.getDate() + n)
  return dateStr(d)
}

function num(v, def) {
  const n = Number(v)
  return isNaN(n) ? def : n
}

/**
 * 咖啡豆状态：养豆中 / 最佳风味 / 风味衰退 / 已过期
 * 时间轴：0 ── restDays ── peakDays ── shelfDays ──>
 */
function getBeanStatus(bean) {
  const empty = { key: 'unknown', label: '待设置', tone: 'grey', tip: '填写烘焙日期后自动计算', progress: 0 }
  if (!bean || !bean.roastDate) return empty

  const days = daysSince(bean.roastDate)
  if (days === null) return empty

  const rest = num(bean.restDays, BEAN_DEFAULTS.restDays)
  const peak = num(bean.peakDays, BEAN_DEFAULTS.peakDays)
  const shelf = num(bean.shelfDays, BEAN_DEFAULTS.shelfDays)

  if (days < 0) {
    return {
      key: 'future', label: '未到烘焙日', tone: 'grey', days: days,
      tip: '烘焙日期在未来，请检查', progress: 0
    }
  }
  if (days < rest) {
    return {
      key: 'resting', label: '养豆中', tone: 'blue', days: days,
      tip: '还需养 ' + (rest - days) + ' 天，' + addDays(bean.roastDate, rest) + ' 后可开喝',
      progress: Math.min(1, days / Math.max(rest, 1)),
      endDate: addDays(bean.roastDate, rest)
    }
  }
  if (days <= peak) {
    return {
      key: 'peak', label: '最佳风味', tone: 'green', days: days,
      tip: '风味巅峰期，还剩 ' + (peak - days) + ' 天',
      progress: Math.min(1, (days - rest) / Math.max(peak - rest, 1)),
      endDate: addDays(bean.roastDate, peak)
    }
  }
  if (days <= shelf) {
    return {
      key: 'fading', label: '风味衰退', tone: 'orange', days: days,
      tip: '已过巅峰 ' + (days - peak) + ' 天，建议尽快喝完',
      progress: Math.min(1, (days - peak) / Math.max(shelf - peak, 1)),
      endDate: addDays(bean.roastDate, shelf)
    }
  }
  return {
    key: 'expired', label: '已过保质期', tone: 'red', days: days,
    tip: '超期 ' + (days - shelf) + ' 天，不建议继续饮用',
    progress: 1,
    endDate: addDays(bean.roastDate, shelf)
  }
}

// 剩余量百分比 & 低库存提示
function getStock(bean) {
  const total = num(bean.weight, 0)
  const left = num(bean.remaining, total)
  const pct = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0
  return {
    total: total,
    left: left,
    pct: pct,
    low: total > 0 && left / total <= LOW_STOCK_RATIO
  }
}

function ratioText(dose, water) {
  const d = Number(dose)
  const w = Number(water)
  if (!d || !w) return ''
  return '1:' + (Math.round((w / d) * 10) / 10)
}

/**
 * 把配方里的时间字符串解析成秒，用于冲煮计时器。
 * 支持：'2:30'（分:秒）、'2:30-3:00'（取第一个）、'25s'、'25-28s'（取第一个）
 * 解析不出来返回 0（调用方回退到默认值）
 */
function parseDuration(str) {
  const s = String(str || '').trim()
  if (!s) return 0
  // 先取时间段的左端（范围值取更快的那个，倒计时更安全）
  const first = s.split(/[-~—]/)[0].trim()
  if (first.indexOf(':') > -1) {
    const parts = first.split(':')
    const m = Number(parts[0])
    const sec = Number(parts[1])
    if (isNaN(m) || isNaN(sec)) return 0
    return Math.max(0, m * 60 + sec)
  }
  const n = parseFloat(first)
  if (isNaN(n)) return 0
  return Math.max(0, Math.round(n))
}

// 秒 -> '2:30'
function mmss(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0))
  const m = Math.floor(total / 60)
  const s = total % 60
  return m + ':' + pad(s)
}

// 时间戳 -> 'YYYY-MM-DD'（本地时区，用于按天聚合）
function dateKey(ts) {
  const d = ts instanceof Date ? ts : new Date(ts || Date.now())
  return dateStr(d)
}

// 时间戳 -> 星期几（一 / 二 / ... / 日）
function weekdayCN(ts) {
  const d = ts instanceof Date ? ts : new Date(ts || Date.now())
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

/**
 * 生成最近 n 天（含今天）的日期骨架，按时间正序。
 * @returns [{ key: 'YYYY-MM-DD', label: '一', date: '9-15' }]
 */
function recentDays(n) {
  const total = n || 7
  const out = []
  const base = new Date()
  base.setHours(0, 0, 0, 0)
  for (let i = total - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86400000)
    out.push({
      key: dateStr(d),
      label: weekdayCN(d),
      date: (d.getMonth() + 1) + '-' + d.getDate()
    })
  }
  return out
}

module.exports = {
  pad: pad,
  dateStr: dateStr,
  formatTime: formatTime,
  formatFull: formatFull,
  daysSince: daysSince,
  addDays: addDays,
  num: num,
  getBeanStatus: getBeanStatus,
  getStock: getStock,
  ratioText: ratioText,
  parseDuration: parseDuration,
  mmss: mmss,
  dateKey: dateKey,
  weekdayCN: weekdayCN,
  recentDays: recentDays
}
