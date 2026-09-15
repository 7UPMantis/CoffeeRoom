const store = require('../../utils/store.js')
const C = require('../../utils/constants.js')
const util = require('../../utils/util.js')

Page({
  data: {
    categories: [{ key: 'all', label: '全部', icon: '🏠' }].concat(C.CATEGORIES),
    activeCat: 'all',
    keyword: '',
    all: [],
    list: []
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
    return store.recipes.list().then(function (list) {
      const decorated = list.map(function (r) {
        const cat = C.categoryOf(r.category)
        return Object.assign({}, r, {
          _catLabel: cat.label,
          _catIcon: cat.icon,
          _toolLabel: C.labelOf(C.TOOLS, r.tool),
          _ratio: util.ratioText(r.dose, r.water),
          _time: r.createdAt ? util.formatTime(r.createdAt) : ''
        })
      })
      self.setData({ all: decorated }, function () {
        self.applyFilter()
        if (done) done()
      })
    })
  },

  applyFilter: function () {
    const kw = (this.data.keyword || '').trim().toLowerCase()
    const list = this.data.all.filter(function (r) {
      if (this.data.activeCat !== 'all' && r.category !== this.data.activeCat) return false
      if (!kw) return true
      const hay = [r.name, r._catLabel, r._toolLabel, (r.tags || []).join(' '), r.beanName || ''].join(' ').toLowerCase()
      return hay.indexOf(kw) > -1
    }, this)
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
  }
})
