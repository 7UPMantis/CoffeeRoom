const store = require('../../utils/store.js')
const C = require('../../utils/constants.js')
const util = require('../../utils/util.js')

Page({
  data: {
    categories: [{ key: 'all', label: '全部', icon: '🏠' }].concat(C.CATEGORIES),
    activeCat: 'all',
    keyword: '',
    all: [],
    list: [],
    // 待做队列：点单后的待制作清单，制作者在这里认领并向冲煮计时器交接
    queue: [],
    queueCups: 0
  },

  onShow: function () {
    this.load()
  },

  onPullDownRefresh: function () {
    const self = this
    this.load(function () { wx.stopPullDownRefresh() })
  },

  load: function (done) {
    const self = this
    Promise.all([
      store.recipes.list(),
      store.orders.list()
    ]).then(function (res) {
      const recipes = res[0] || []
      const orders = res[1] || []

      const decorated = recipes.map(function (r) {
        const cat = C.categoryOf(r.category)
        return Object.assign({}, r, {
          _catLabel: cat.label,
          _catIcon: cat.icon,
          _toolLabel: C.labelOf(C.TOOLS, r.tool),
          _ratio: util.ratioText(r.dose, r.water),
          _time: r.createdAt ? util.formatTime(r.createdAt) : '',
          _beanTypeLabel: C.beanTypeLabel(C.inferBeanType(r))
        })
      })

      // 待做队列：只要 status 为 pending 的订单
      let queueCups = 0
      const queue = orders.filter(function (o) {
        return (o.status || 'pending') === 'pending'
      }).map(function (o) {
        const items = (o.items || []).map(function (it) {
          return {
            recipeId: it.recipeId,
            name: it.name,
            count: it.count,
            beanName: it.beanName || '',
            beanId: it.beanId || ''
          }
        })
        queueCups += o.totalCount || 0
        return {
          _id: o._id,
          forWho: o.forWho || '不指定',
          note: o.note || '',
          cups: o.totalCount || 0,
          timeText: util.formatFull(o.createdAt),
          items: items
        }
      })

      self.setData({ all: decorated, queue: queue, queueCups: queueCups }, function () {
        self.applyFilter()
        if (done) done()
      })
    })
  },

  applyFilter: function () {
    const kw = (this.data.keyword || '').trim().toLowerCase()
    const activeCat = this.data.activeCat
    const list = this.data.all.filter(function (r) {
      if (activeCat !== 'all' && r.category !== activeCat) return false
      if (!kw) return true
      const hay = [r.name, r._catLabel, r._toolLabel, (r.tags || []).join(' '), r.beanName || ''].join(' ').toLowerCase()
      return hay.indexOf(kw) > -1
    })
    this.setData({ list: list })
  },

  onCatTap: function (e) {
    this.setData({ activeCat: e.currentTarget.dataset.key }, this.applyFilter)
  },

  onSearch: function (e) {
    this.setData({ keyword: e.detail.value }, this.applyFilter)
  },

  onClearSearch: function () {
    this.setData({ keyword: '' }, this.applyFilter)
  },

  onAdd: function () {
    wx.navigateTo({ url: '/pages/recipe-edit/recipe-edit' })
  },

  onEdit: function (e) {
    wx.navigateTo({ url: '/pages/recipe-edit/recipe-edit?id=' + e.currentTarget.dataset.id })
  },

  onBrew: function (e) {
    wx.navigateTo({ url: '/pages/brew/brew?id=' + e.currentTarget.dataset.id })
  },

  // 从待做队列进入冲煮，带上订单上下文
  onBrewFromQueue: function (e) {
    const ds = e.currentTarget.dataset
    wx.navigateTo({
      url: '/pages/brew/brew?id=' + ds.id + '&orderId=' + ds.order
    })
  },

  // 直接把这一单标记完成（没走计时器的情况）
  onQueueDone: function (e) {
    const id = e.currentTarget.dataset.id
    const self = this
    store.orders.update(id, { status: 'done' }).then(function () {
      wx.showToast({ title: '这一单已完成', icon: 'success' })
      self.load()
    })
  },

  onToggleFav: function (e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.all.find(function (r) { return r._id === id })
    if (!item) return
    const self = this
    store.recipes.update(id, { favorite: !item.favorite }).then(function () {
      self.load()
    })
  },

  onDelete: function (e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    const self = this
    wx.showModal({
      title: '删除配方',
      content: '确定删除「' + name + '」？此操作不可恢复',
      confirmColor: '#E0483A',
      success: function (res) {
        if (!res.confirm) return
        store.recipes.remove(id).then(function () {
          wx.showToast({ title: '已删除', icon: 'success' })
          self.load()
        })
      }
    })
  },

  onShareAppMessage: function () {
    return {
      title: '咖屋 · 我家的咖啡配方都在这',
      path: '/pages/recipe/recipe'
    }
  },

  onShareTimeline: function () {
    return { title: '咖屋 · 我家的咖啡配方都在这' }
  }
})
