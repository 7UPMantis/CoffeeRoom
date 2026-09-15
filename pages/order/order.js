const store = require('../../utils/store.js')
const C = require('../../utils/constants.js')
const util = require('../../utils/util.js')

Page({
  data: {
    categories: [{ key: 'all', label: '全部', icon: '🏠' }].concat(C.CATEGORIES),
    activeCat: 'all',
    keyword: '',
    recipes: [],
    beanCount: 0,
    cart: {}, // { recipeId: count }
    cartCount: 0,
    cartList: [],
    showSheet: false,
    forWho: '',
    note: ''
  },

  onLoad: function () {
    this.load()
  },

  onShow: function () {
    this.load()
  },

  onPullDownRefresh: function () {
    this.load(function () { wx.stopPullDownRefresh() })
  },

  load: function (done) {
    const self = this
    Promise.all([
      store.recipes.list(),
      store.beans.list()
    ]).then(function (res) {
      self.setData({
        recipes: self.decorate(res[0] || []),
        beanCount: (res[1] || []).length
      }, function () {
        self.syncList()
        self.syncCart()
        if (done) done()
      })
    })
  },

  decorate: function (list) {
    return list.map(function (r) {
      const cat = C.categoryOf(r.category)
      return Object.assign({}, r, {
        _catLabel: cat.label,
        _catIcon: cat.icon,
        _toolLabel: C.labelOf(C.TOOLS, r.tool),
        _ratio: util.ratioText(r.dose, r.water)
      })
    })
  },

  filtered: function () {
    const kw = (this.data.keyword || '').trim().toLowerCase()
    return this.data.recipes.filter(function (r) {
      if (this.data.activeCat !== 'all' && r.category !== this.data.activeCat) return false
      if (!kw) return true
      const hay = [r.name, r._catLabel, r._toolLabel, (r.tags || []).join(' '), r.beanName || ''].join(' ').toLowerCase()
      return hay.indexOf(kw) > -1
    }, this)
  },

  // 计算属性同步到 data
  syncList: function () {
    this.setData({ list: this.filtered() })
  },

  onCatTap: function (e) {
    this.setData({ activeCat: e.currentTarget.dataset.key }, this.syncList)
  },

  onSearch: function (e) {
    this.setData({ keyword: e.detail.value }, this.syncList)
  },

  onClearSearch: function () {
    this.setData({ keyword: '' }, this.syncList)
  },

  onMinus: function (e) {
    const id = e.currentTarget.dataset.id
    const cart = Object.assign({}, this.data.cart)
    const cur = cart[id] || 0
    if (cur <= 1) delete cart[id]
    else cart[id] = cur - 1
    this.setData({ cart: cart }, this.syncCart)
  },

  onPlus: function (e) {
    const id = e.currentTarget.dataset.id
    const cart = Object.assign({}, this.data.cart)
    cart[id] = (cart[id] || 0) + 1
    this.setData({ cart: cart }, this.syncCart)
  },

  syncCart: function () {
    const cart = this.data.cart
    const map = {}
    this.data.recipes.forEach(function (r) { map[r._id] = r })
    const list = Object.keys(cart).map(function (id) {
      const r = map[id]
      if (!r) return null
      return { id: id, name: r.name, count: cart[id], catLabel: r._catLabel }
    }).filter(Boolean)
    const count = list.reduce(function (s, i) { return s + i.count }, 0)
    this.setData({ cartList: list, cartCount: count })
  },

  onCartTap: function () {
    if (!this.data.cartCount) return
    this.setData({ showSheet: true })
  },

  onCloseSheet: function () {
    this.setData({ showSheet: false })
  },

  stopPop: function () {},

  onForWho: function (e) {
    this.setData({ forWho: e.detail.value })
  },

  onNote: function (e) {
    this.setData({ note: e.detail.value })
  },

  onSubmit: function () {
    const self = this
    if (!this.data.cartCount) return
    const items = this.data.cartList.map(function (i) {
      return { recipeId: i.id, name: i.name, count: i.count }
    })
    wx.showLoading({ title: '提交中' })
    store.orders.add({
      items: items,
      totalCount: this.data.cartCount,
      forWho: (this.data.forWho || '').trim() || '不指定',
      note: (this.data.note || '').trim(),
      status: 'pending'
    }).then(function () {
      wx.hideLoading()
      wx.showToast({ title: '已下单', icon: 'success' })
      self.setData({ cart: {}, cartList: [], cartCount: 0, showSheet: false, forWho: '', note: '' })
      self.syncList()
    }).catch(function (e) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
      console.error(e)
    })
  },

  onGoRecipe: function () {
    wx.switchTab({ url: '/pages/recipe/recipe' })
  }
})
