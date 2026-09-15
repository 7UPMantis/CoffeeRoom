const BEAN_DEFAULTS = require('./constants.js').BEAN_DEFAULTS

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
    low: total > 0 && left / total <= 0.15
  }
}

function ratioText(dose, water) {
  const d = Number(dose)
  const w = Number(water)
  if (!d || !w) return ''
  return '1:' + (Math.round((w / d) * 10) / 10)
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
  ratioText: ratioText
}
