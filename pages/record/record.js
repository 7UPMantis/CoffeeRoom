const store = require('../../utils/store.js')
const util = require('../../utils/util.js')
const seed = require('../../utils/seed.js')

Page({
  data: {
    orders: [],
    mode: '',
    modeText: '',
    envId: '',
    monthCount: 0,
    totalCount: 0
  },

  onShow: function () {
    this.refreshMode()
    this.load()
  },

  onPullDownRefresh: function () {
    const self = this
    this.load(function () { wx.stopPullDownRefresh() })
  },

  refreshMode: function () {
    const app = getApp()
    const envId = (app && app.globalData.envId) || ''
    const self = this
    store.mode().then(function (m) {
      self.setData({
        mode: m,
        envId: envId,
        modeText: m === 'cloud' ? '云开发数据库（家人可共享）' : '本地存储（仅本机）'
      })
    })
  },

  load: function (done) {
    const self = this
    store.orders.list().then(function (list) {
      const now = new Date()
      const monthKey = now.getFullYear() + '-' + util.pad(now.getMonth() + 1)
      let monthCount = 0
      let totalCount = 0
      const decorated = list.map(function (o) {
        const d = new Date(o.createdAt || Date.now())
        const key = d.getFullYear() + '-' + util.pad(d.getMonth() + 1)
        if (key === monthKey) monthCount += (o.totalCount || 0)
        totalCount += (o.totalCount || 0)
        return Object.assign({}, o, {
          _time: util.formatFull(o.createdAt),
          _summary: (o.items || []).map(function (i) {
            return i.name + '×' + i.count
          }).join('、')
        })
      })
      self.setData({ orders: decorated, monthCount: monthCount, totalCount: totalCount })
      if (done) done()
    })
  },

  onToggleStatus: function (e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.orders.find(function (o) { return o._id === id })
    if (!item) return
    const self = this
    store.orders.update(id, { status: item.status === 'done' ? 'pending' : 'done' }).then(function () {
      self.load()
    })
  },

  onDelete: function (e) {
    const id = e.currentTarget.dataset.id
    const self = this
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条点单记录？',
      confirmColor: '#E0483A',
      success: function (res) {
        if (!res.confirm) return
        store.orders.remove(id).then(function () {
          wx.showToast({ title: '已删除', icon: 'success' })
          self.load()
        })
      }
    })
  },

  onRedetect: function () {
    const self = this
    wx.showLoading({ title: '检测中' })
    store.resetDetect()
    store.mode().then(function (m) {
      wx.hideLoading()
      self.refreshMode()
      self.load()
      wx.showToast({ title: m === 'cloud' ? '已连接云开发' : '使用本地存储', icon: 'none' })
    })
  },

  // 云模式下先确保三个集合已创建；失败也不阻断（本地模式本来就不需要）
  ensureCollections: function () {
    return store.mode().then(function (m) {
      if (m !== 'cloud' || !wx.cloud) return null
      return wx.cloud.callFunction({ name: 'initDb' }).catch(function (e) {
        console.warn('[record] initDb 调用失败，尝试直接写入', e)
        return null
      })
    })
  },

  errText: function (e) {
    const msg = (e && (e.errMsg || e.message)) || String(e)
    if (msg.indexOf('collection not exists') > -1 || msg.indexOf('-502005') > -1 ||
        msg.indexOf('COLLECTION') > -1 || msg.indexOf('collection') > -1) {
      return '数据库集合还没建好。请到云开发控制台 → 数据库，手动新建 recipes、beans、orders 三个集合，然后重试。'
    }
    return msg
  },

  onSeed: function () {
    const self = this
    wx.showModal({
      title: '初始化示例数据',
      content: '将添加 2 支示例咖啡豆和 5 个示例配方，确定吗？',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: '生成中' })
        self.ensureCollections().then(function () {
          return seed.run()
        }).then(function () {
          wx.hideLoading()
          wx.showToast({ title: '已生成', icon: 'success' })
          self.load()
        }).catch(function (e) {
          wx.hideLoading()
          wx.showModal({
            title: '生成失败',
            content: self.errText(e),
            showCancel: false
          })
          console.error(e)
        })
      }
    })
  }
})
