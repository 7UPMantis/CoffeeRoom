const store = require('../../utils/store.js')
const C = require('../../utils/constants.js')
const util = require('../../utils/util.js')

const PRIORITY = { peak: 0, resting: 1, fading: 2, expired: 3, future: 4, unknown: 5 }

Page({
  data: {
    beans: [],
    summary: { peak: 0, resting: 0, fading: 0, expired: 0, unknown: 0 },
    totalWeight: 0
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
        return Object.assign({}, b, {
          _status: status,
          _stock: stock,
          _roastLabel: C.labelOf(C.ROASTS, b.roast),
          _pct: Math.round(stock.pct * 100),
          _days: status.days === undefined ? null : status.days
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
      decorated.forEach(function (b) {
        const k = b._status.key
        if (summary[k] === undefined) summary.unknown++
        else summary[k]++
        total += b._stock.left
      })
      self.setData({ beans: decorated, summary: summary, totalWeight: total })
      if (done) done()
    })
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
