const store = require('../../utils/store.js')
const C = require('../../utils/constants.js')
const util = require('../../utils/util.js')
const stock = require('../../utils/stock.js')

Page({
  data: {
    categories: [{ key: 'all', label: '全部', icon: '🏠' }].concat(C.CATEGORIES),
    activeCat: 'all',
    keyword: '',
    recipes: [],
    list: [],
    beanCount: 0,
    lowBeans: [], // 余量偏低（<=15%）或已空的豆，用于顶部提醒
    cart: {}, // { recipeId: count }
    cartCount: 0,
    cartGrams: 0,
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
      const beans = res[1] || []
      const bmap = {}
      beans.forEach(function (b) { bmap[b._id] = b })

      const lowBeans = beans.filter(function (b) {
        const st = util.getStock(b)
        return st.pct <= 0.15
      }).map(function (b) {
        const st = util.getStock(b)
        return {
          name: b.name,
          pct: Math.round(st.pct * 100),
          left: st.left,
          empty: st.left <= 0
        }
      })

      self._bmap = bmap
      self.setData({
        recipes: self.decorate(res[0] || [], bmap),
        beanCount: beans.length,
        lowBeans: lowBeans
      }, function () {
        self.syncList()
        self.syncCart()
        if (done) done()
      })
    })
  },

  decorate: function (list, bmap) {
    return list.map(function (r) {
      const cat = C.categoryOf(r.category)
      const bean = r.beanId ? bmap[r.beanId] : null
      const dose = util.num(r.dose, 0)
      const left = bean ? util.num(bean.remaining, 0) : 0
      return Object.assign({}, r, {
        _catLabel: cat.label,
        _catIcon: cat.icon,
        _toolLabel: C.labelOf(C.TOOLS, r.tool),
        _ratio: util.ratioText(r.dose, r.water),
        _hasCover: !!r.cover,
        // 豆量联动：能不能做、还能做几杯（粗略，按单杯 dose 估算）
        _noBean: !r.beanId,
        _beanGone: !!r.beanId && !bean,
        _beanLeft: left,
        _cupsLeft: dose > 0 ? Math.floor(left / dose) : 0,
        _short: !!r.beanId && !!bean && dose > 0 && left < dose
      })
    })
  },

  filtered: function () {
    const kw = (this.data.keyword || '').trim().toLowerCase()
    const activeCat = this.data.activeCat
    return this.data.recipes.filter(function (r) {
      if (activeCat !== 'all' && r.category !== activeCat) return false
      if (!kw) return true
      const hay = [r.name, r._catLabel, r._toolLabel, (r.tags || []).join(' '), r.beanName || ''].join(' ').toLowerCase()
      return hay.indexOf(kw) > -1
    })
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
    let grams = 0
    const list = Object.keys(cart).map(function (id) {
      const r = map[id]
      if (!r) return null
      const dose = util.num(r.dose, 0)
      if (r.beanId && dose) grams += dose * cart[id]
      return {
        id: id,
        name: r.name,
        count: cart[id],
        catLabel: r._catLabel,
        beanName: r.beanName || '',
        grams: r.beanId && dose ? dose * cart[id] : 0
      }
    }).filter(Boolean)
    const count = list.reduce(function (s, i) { return s + i.count }, 0)
    this.setData({ cartList: list, cartCount: count, cartGrams: grams })
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

  // 一键把「常喝」加进购物车
  onQuickFav: function () {
    const favorites = this.data.recipes.filter(function (r) { return r.favorite })
    if (!favorites.length) {
      wx.showToast({ title: '还没有设常喝的配方', icon: 'none' })
      return
    }
    const cart = Object.assign({}, this.data.cart)
    favorites.forEach(function (r) { cart[r._id] = (cart[r._id] || 0) + 1 })
    this.setData({ cart: cart }, this.syncCart)
    wx.showToast({ title: '已加入 ' + favorites.length + ' 款常喝', icon: 'none' })
  },

  onSubmit: function () {
    const self = this
    if (!this.data.cartCount) return
    const items = this.data.cartList.map(function (i) {
      return { recipeId: i.id, name: i.name, count: i.count }
    })

    wx.showLoading({ title: '核算用豆' })
    stock.planUsage(items).then(function (calc) {
      wx.hideLoading()
      const short = (calc.plan || []).filter(function (p) { return p.shortage > 0 || p.missing })
      if (short.length) {
        const lines = short.map(function (p) {
          if (p.missing) return '· ' + p.beanName + '（已删除）需 ' + Math.round(p.grams) + 'g'
          return '· ' + p.beanName + ' 需 ' + Math.round(p.grams) + 'g，仅余 ' + Math.round(p.before) + 'g'
        }).join('\n')
        wx.showModal({
          title: '咖啡豆不够了',
          content: lines + '\n\n仍要下单吗？（余量会扣到 0）',
          confirmText: '仍然下单',
          cancelText: '返回调整',
          success: function (res) {
            if (res.confirm) self.doSubmit(items, calc)
          }
        })
        return
      }
      self.doSubmit(items, calc)
    }).catch(function (e) {
      wx.hideLoading()
      wx.showToast({ title: '核算失败，请重试', icon: 'none' })
      console.error('[order] planUsage 失败', e)
    })
  },

  doSubmit: function (items, calc) {
    const self = this
    wx.showLoading({ title: '提交中' })
    stock.applyUsage(calc.plan).then(function (usage) {
      return store.orders.add({
        items: items,
        totalCount: self.data.cartCount,
        forWho: (self.data.forWho || '').trim() || '不指定',
        note: (self.data.note || '').trim(),
        status: 'pending',
        beanUsage: usage
      }).then(function () { return usage })
    }).then(function (usage) {
      wx.hideLoading()
      const txt = stock.usageText(usage)
      wx.showToast({
        title: txt ? '已下单 · ' + txt : '已下单',
        icon: 'none',
        duration: 2200
      })
      self.setData({ cart: {}, cartList: [], cartCount: 0, cartGrams: 0, showSheet: false, forWho: '', note: '' }, function () {
        self.load()
      })
    }).catch(function (e) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
      console.error(e)
    })
  },

  // 跳到冲煮计时器
  onBrew: function (e) {
    wx.navigateTo({ url: '/pages/brew/brew?id=' + e.currentTarget.dataset.id })
  },

  onGoRecipe: function () {
    wx.switchTab({ url: '/pages/recipe/recipe' })
  },

  onGoBean: function () {
    wx.switchTab({ url: '/pages/bean/bean' })
  },

  onShareAppMessage: function () {
    return {
      title: '咖屋 · 记录家里的每一杯咖啡',
      path: '/pages/order/order'
    }
  },

  onShareTimeline: function () {
    return { title: '咖屋 · 记录家里的每一杯咖啡' }
  }
})
