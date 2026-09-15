const store = require('../../utils/store.js')
const C = require('../../utils/constants.js')
const util = require('../../utils/util.js')

const FALLBACK_SEC = 150 // 配方没写时间时的兜底：2 分 30 秒

Page({
  data: {
    id: '',
    orderId: '',
    forWho: '',
    orderCount: 0,
    useBeanName: '',
    name: '',
    cover: '',
    catLabel: '',
    catIcon: '',
    toolLabel: '',
    beanName: '',
    ratio: '',
    dose: '',
    water: '',
    temp: '',
    timeText: '',
    steps: [], // [{ text, done }]
    doneCount: 0,
    targetSec: FALLBACK_SEC,
    remain: FALLBACK_SEC,
    remainText: '2:30',
    progress: 0, // 0~1 已完成比例
    running: false,
    finished: false,
    presetLabel: ''
  },

  onLoad: function (opts) {
    if (!opts || !opts.id) {
      wx.showToast({ title: '缺少配方参数', icon: 'none' })
      setTimeout(function () { wx.navigateBack() }, 800)
      return
    }
    this.setData({ id: opts.id, orderId: (opts && opts.orderId) || '' })
    this.loadRecipe(opts.id)
    if (opts && opts.orderId) this.loadOrderContext(opts.orderId, opts.id)
    wx.setKeepScreenOn({ keepScreenOn: true })
  },

  // 从待做队列进来时，带上「给谁做 / 几杯 / 用哪支豆」
  loadOrderContext: function (orderId, recipeId) {
    const self = this
    store.orders.list().then(function (orders) {
      const o = (orders || []).filter(function (x) { return x._id === orderId })[0]
      if (!o) return
      const hit = (o.items || []).filter(function (it) { return it.recipeId === recipeId })[0]
      self.setData({
        forWho: o.forWho || '不指定',
        orderCount: (hit && hit.count) || o.totalCount || 0,
        useBeanName: (hit && hit.beanName) || ''
      })
    })
  },

  onUnload: function () {
    this.clearTimer()
    wx.setKeepScreenOn({ keepScreenOn: false })
  },

  onHide: function () {
    // 切走时暂停，避免后台空跑
    if (this.data.running) this.pause()
  },

  loadRecipe: function (id) {
    const self = this
    store.recipes.get(id).then(function (r) {
      if (!r) {
        wx.showToast({ title: '配方不存在', icon: 'none' })
        return
      }
      const cat = C.categoryOf(r.category)
      const sec = util.parseDuration(r.time) || FALLBACK_SEC
      const steps = (r.steps && r.steps.length ? r.steps : ['按配方步骤冲煮']).map(function (s) {
        return { text: s, done: false }
      })
      wx.setNavigationBarTitle({ title: r.name })
      self.setData({
        name: r.name || '',
        cover: r.cover || '',
        catLabel: cat.label,
        catIcon: cat.icon,
        toolLabel: C.labelOf(C.TOOLS, r.tool),
        beanName: r.beanName || '',
        ratio: util.ratioText(r.dose, r.water),
        dose: r.dose || '',
        water: r.water || '',
        temp: r.temp || '',
        timeText: r.time || '',
        presetLabel: r.time ? '按配方 ' + r.time : '配方未填时长，默认 2:30',
        steps: steps,
        doneCount: 0,
        targetSec: sec,
        remain: sec,
        remainText: util.mmss(sec),
        progress: 0,
        running: false,
        finished: false
      })
    }).catch(function (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
      console.error('[brew] 加载配方失败', e)
    })
  },

  clearTimer: function () {
    if (this._timer) {
      clearInterval(this._timer)
      this._timer = null
    }
  },

  onToggle: function () {
    if (this.data.running) this.pause()
    else this.start()
  },

  start: function () {
    const self = this
    this.clearTimer()
    if (this.data.finished || this.data.remain <= 0) {
      this.setData({ remain: this.data.targetSec, remainText: util.mmss(this.data.targetSec), progress: 0, finished: false })
    }
    this.setData({ running: true })
    this._timer = setInterval(function () {
      const next = self.data.remain - 1
      if (next <= 0) {
        self.clearTimer()
        self.setData({ remain: 0, remainText: '0:00', progress: 1, running: false, finished: true })
        self.onFinish()
        return
      }
      self.setData({
        remain: next,
        remainText: util.mmss(next),
        progress: 1 - next / self.data.targetSec
      })
    }, 1000)
  },

  pause: function () {
    this.clearTimer()
    this.setData({ running: false })
  },

  onReset: function () {
    this.clearTimer()
    this.setData({
      remain: this.data.targetSec,
      remainText: util.mmss(this.data.targetSec),
      progress: 0,
      running: false,
      finished: false
    })
  },

  onAdjust: function (e) {
    const delta = Number(e.currentTarget.dataset.delta)
    const target = Math.max(10, this.data.targetSec + delta)
    const remain = Math.max(0, this.data.remain + delta)
    this.setData({
      targetSec: target,
      remain: remain,
      remainText: util.mmss(remain),
      progress: target > 0 ? Math.min(1, 1 - remain / target) : 0,
      finished: false,
      presetLabel: '手动调整 ' + util.mmss(target)
    })
  },

  onStepTap: function (e) {
    const i = Number(e.currentTarget.dataset.index)
    const steps = this.data.steps.slice()
    if (!steps[i]) return
    steps[i] = Object.assign({}, steps[i], { done: !steps[i].done })
    const doneCount = steps.filter(function (s) { return s.done }).length
    this.setData({ steps: steps, doneCount: doneCount })
    wx.vibrateShort({ type: 'light' })
  },

  onNextStep: function () {
    const steps = this.data.steps.slice()
    const idx = steps.findIndex(function (s) { return !s.done })
    if (idx < 0) return
    for (let i = 0; i <= idx; i++) steps[i] = Object.assign({}, steps[i], { done: true })
    const doneCount = steps.filter(function (s) { return s.done }).length
    this.setData({ steps: steps, doneCount: doneCount })
    wx.vibrateShort({ type: 'light' })
  },

  onFinish: function () {
    const self = this
    wx.vibrateLong()
    if (this.data.orderId) {
      wx.showModal({
        title: '时间到 ☕',
        content: '冲煮完成。把「' + (this.data.forWho || '这一单') + '」标记成已做完吗？',
        confirmText: '标记完成',
        cancelText: '先不用',
        success: function (res) {
          if (!res.confirm) return
          store.orders.update(self.data.orderId, { status: 'done' }).then(function () {
            wx.showToast({ title: '已标记完成', icon: 'success' })
          })
        }
      })
      return
    }
    wx.showModal({
      title: '时间到 ☕',
      content: '冲煮完成，趁热喝。',
      showCancel: false,
      confirmText: '好的'
    })
  },

  onReorder: function () {
    // 从计时器直接再点一杯
    const self = this
    store.recipes.get(this.data.id).then(function () {
      wx.showToast({ title: '去点单页下单吧', icon: 'none' })
      setTimeout(function () { wx.switchTab({ url: '/pages/order/order' }) }, 600)
    })
  },

  onShareAppMessage: function () {
    return {
      title: '一起冲一杯「' + this.data.name + '」',
      path: '/pages/brew/brew?id=' + this.data.id
    }
  }
})
