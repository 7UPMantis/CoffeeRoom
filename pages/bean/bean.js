const store = require('../../utils/store.js')
const C = require('../../utils/constants.js')
const util = require('../../utils/util.js')

const PRIORITY = { peak: 0, resting: 1, fading: 2, expired: 3, future: 4, unknown: 5 }

Page({
  data: {
    beans: [],
    visibleBeans: [],  // 按用途筛选后实际渲染的列表
    activeUsage: '',   // '' 全部 / 'none' 未标用途 / 其它为用途 key
    activeUsageLabel: '',
    summary: { peak: 0, resting: 0, fading: 0, expired: 0, unknown: 0 },
    totalWeight: 0,
    todos: [] // 「该处理了」清单：低余量 / 临期 / 已过期
  },

  onShow: function () {
    this.load()
  },

  onPullDownRefresh: function () {
    this.load(function () { wx.stopPullDownRefresh() })
  },

  load: function (done) {
    const self = this
    store.beans.list().then(function (list) {
      const decorated = list.map(function (b) {
        const status = util.getBeanStatus(b)
        const stock = util.getStock(b)
        const usageTags = b.usageTags || []
        return Object.assign({}, b, {
          _status: status,
          _stock: stock,
          _roastLabel: C.labelOf(C.ROASTS, b.roast),
          _pct: Math.round(stock.pct * 100),
          _days: status.days === undefined ? null : status.days,
          _usageTags: usageTags,
          _usages: usageTags.map(function (k) { return { key: k, label: C.usageLabel(k) } }),
          _noUsage: !usageTags.length
        })
      })
      decorated.sort(function (a, b) {
        const pa = PRIORITY[a._status.key] === undefined ? 9 : PRIORITY[a._status.key]
        const pb = PRIORITY[b._status.key] === undefined ? 9 : PRIORITY[b._status.key]
        if (pa !== pb) return pa - pb
        return (b.roastDate || '').localeCompare(a.roastDate || '')
      })

      const summary = { peak: 0, resting: 0, fading: 0, expired: 0, unknown: 0 }
      let total = 0
      const todos = []
      decorated.forEach(function (b) {
        const k = b._status.key
        if (summary[k] === undefined) summary.unknown++
        else summary[k]++
        total += b._stock.left

        // 该处理了：低余量 / 已过期 / 风味衰退 / 快到保质期（7 天内）
        const reasons = []
        if (b._stock.left <= 0) reasons.push({ text: '已经用完', tone: 'red' })
        else if (b._stock.low) reasons.push({ text: '只剩 ' + b._stock.left + 'g，该补货了', tone: 'orange' })
        if (k === 'expired') reasons.push({ text: '已过保质期 ' + (b._status.days - C.BEAN_DEFAULTS.shelfDays) + ' 天', tone: 'red' })
        else if (k === 'fading') {
          const left = C.BEAN_DEFAULTS.shelfDays - b._status.days
          reasons.push({ text: left <= 7 ? '还有 ' + left + ' 天过期，尽快喝完' : '已过风味巅峰', tone: left <= 7 ? 'red' : 'orange' })
        }
        if (b._noUsage) reasons.push({ text: '未标用途，会出现在所有配方里', tone: 'grey' })

        if (reasons.length) {
          todos.push({
            _id: b._id,
            name: b.name,
            reasons: reasons
          })
        }
      })

      self.setData({ beans: decorated, summary: summary, totalWeight: total, todos: todos }, function () {
        self.applyFilter()
        if (done) done()
      })
    })
  },

  // 按用途筛选：手冲 / 意式 / 冷萃 / 通用 / 未标用途
  applyFilter: function () {
    const u = this.data.activeUsage
    const beans = this.data.beans || []
    let list = beans
    if (u === 'none') {
      list = beans.filter(function (b) { return b._noUsage })
    } else if (u) {
      list = beans.filter(function (b) { return (b._usageTags || []).indexOf(u) > -1 })
    }
    this.setData({
      visibleBeans: list,
      activeUsageLabel: u === 'none' ? '未标用途' : (u ? C.usageLabel(u) : '')
    })
  },

  // 点用途标签切换筛选；再点一次同一个则取消
  onUsageTap: function (e) {
    const u = e.currentTarget.dataset.usage || ''
    const next = this.data.activeUsage === u ? '' : u
    this.setData({ activeUsage: next }, this.applyFilter)
  },

  onClearUsage: function () {
    this.setData({ activeUsage: '' }, this.applyFilter)
  },

  onAdd: function () {
    wx.navigateTo({ url: '/pages/bean-edit/bean-edit' })
  },

  onEdit: function (e) {
    wx.navigateTo({ url: '/pages/bean-edit/bean-edit?id=' + e.currentTarget.dataset.id })
  },

  onDelete: function (e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    const self = this
    // 先查有没有配方在用这支豆：软引用不清理会让配方指向已删除的豆
    store.recipes.list().then(function (recipes) {
      const used = (recipes || []).filter(function (r) { return r.beanId === id })
      const content = used.length
        ? '有 ' + used.length + ' 个配方在用「' + name + '」：\n' + used.map(function (r) { return '· ' + r.name }).join('\n') +
          '\n\n删除后这些配方会变成「未关联咖啡豆」，仍可继续做，但不再扣豆量。确定删除？'
        : '确定删除「' + name + '」？'
      wx.showModal({
        title: '删除咖啡豆',
        content: content,
        confirmColor: '#E0483A',
        success: function (res) {
          if (!res.confirm) return
          wx.showLoading({ title: '处理中' })
          const tasks = [store.beans.remove(id)]
          // 顺手把引用摘掉，避免配方一直指向不存在的豆
          used.forEach(function (r) {
            tasks.push(store.recipes.update(r._id, { beanId: '', beanName: '' }))
          })
          Promise.all(tasks).then(function () {
            wx.hideLoading()
            wx.showToast({ title: used.length ? '已删除并解绑配方' : '已删除', icon: 'none' })
            self.load()
          }).catch(function (err) {
            wx.hideLoading()
            wx.showToast({ title: '删除失败', icon: 'none' })
            console.error('[bean] 删除失败', err)
          })
        }
      })
    })
  }
})
