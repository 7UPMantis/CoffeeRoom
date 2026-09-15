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
    cart: {},      // { recipeId: count }
    cartBean: {},  // { recipeId: beanId }  下单时选定的豆
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
      const recipes = res[0] || []
      const beans = res[1] || []

      // 每个配方按「所需豆用途」预先筛出可选豆，供下单时选择
      const beanOptions = {}
      recipes.forEach(function (r) {
        beanOptions[r._id] = stock.beansFor(r, beans)
      })
      self._beanOptions = beanOptions

      self.setData({ recipes: self.decorate(recipes) }, function () {
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
        _hasCover: !!r.cover
      })
    })
  },

  // 点单页是顾客视角：只按饮品名、分类、标签搜
  filtered: function () {
    const kw = (this.data.keyword || '').trim().toLowerCase()
    const activeCat = this.data.activeCat
    return this.data.recipes.filter(function (r) {
      if (activeCat !== 'all' && r.category !== activeCat) return false
      if (!kw) return true
      const hay = [r.name, r._catLabel, (r.tags || []).join(' ')].join(' ').toLowerCase()
      return hay.indexOf(kw) > -1
    })
  },

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

  // 每款饮品默认选中的豆：配方默认豆 → 该豆在可选列表里就用它，否则用第一个
  defaultBeanOf: function (recipe) {
    const opts = (this._beanOptions && this._beanOptions[recipe._id]) || []
    if (!opts.length) return ''
    const preset = recipe.beanId && opts.filter(function (b) { return b._id === recipe.beanId })[0]
    return (preset || opts[0])._id
  },

  syncCart: function () {
    const self = this
    const cart = this.data.cart
    const map = {}
    this.data.recipes.forEach(function (r) { map[r._id] = r })

    const cartBean = Object.assign({}, this.data.cartBean)
    let grams = 0

    const list = Object.keys(cart).map(function (id) {
      const r = map[id]
      if (!r) return null
      const count = cart[id]
      const dose = util.num(r.dose, 0)
      const opts = (self._beanOptions && self._beanOptions[id]) || []

      // 落定这款的选豆
      let beanId = cartBean[id]
      if (!beanId || !opts.filter(function (b) { return b._id === beanId }).length) {
        beanId = self.defaultBeanOf(r)
      }
      cartBean[id] = beanId
      const bean = opts.filter(function (b) { return b._id === beanId })[0] || null

      const g = (bean && dose) ? dose * count : 0
      grams += g

      return {
        id: id,
        name: r.name,
        count: count,
        catLabel: r._catLabel,
        dose: dose,
        beanOptions: opts.map(function (b) {
          const roast = C.labelOf(C.ROASTS, b.roast)
          const tail = (roast && roast !== '未设置') ? ' · ' + roast : ''
          let mark = ''
          if (b._unlabeled) mark = '（未标注用途）'
          else if (!b._exact) mark = '（通用）'
          return { id: b._id, name: b.name + tail + mark }
        }),
        beanIndex: Math.max(0, opts.findIndex(function (b) { return b._id === beanId })),
        beanId: beanId,
        beanName: bean ? bean.name : '',
        beanUnlabeled: !!(bean && bean._unlabeled),
        noBean: !opts.length,
        grams: g
      }
    }).filter(Boolean)

    const count = list.reduce(function (s, i) { return s + i.count }, 0)
    this.setData({ cartList: list, cartCount: count, cartBean: cartBean, cartGrams: grams })
  },

  // 下单弹层里换豆
  onBeanChange: function (e) {
    const idx = Number(e.currentTarget.dataset.index)
    const item = this.data.cartList[idx]
    if (!item) return
    const picked = item.beanOptions[Number(e.detail.value)]
    if (!picked) return
    const cartBean = Object.assign({}, this.data.cartBean)
    cartBean[item.id] = picked.id
    this.setData({ cartBean: cartBean }, this.syncCart)
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
      wx.showToast({ title: '还没有设常喝的饮品', icon: 'none' })
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
      return {
        recipeId: i.id,
        name: i.name,
        count: i.count,
        beanId: i.beanId,
        beanName: i.beanName,
        dose: i.dose
      }
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
          title: '这支豆不太够',
          content: lines + '\n\n仍要下单吗？（余量会扣到 0）也可以回上一步换一支豆。',
          confirmText: '仍然下单',
          cancelText: '回去换豆',
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
        title: txt ? '已下单 · ' + txt : '已下单，已进待做',
        icon: 'none',
        duration: 2200
      })
      self.setData({
        cart: {},
        cartBean: {},
        cartList: [],
        cartCount: 0,
        cartGrams: 0,
        showSheet: false,
        forWho: '',
        note: ''
      }, function () {
        self.load()
      })
    }).catch(function (e) {
      wx.hideLoading()
      wx.showToast({ title: '提交失败', icon: 'none' })
      console.error(e)
    })
  },

  // 下单后去配方页看「待做」
  onGoQueue: function () {
    wx.switchTab({ url: '/pages/recipe/recipe' })
  },

  onShareAppMessage: function () {
    return {
      title: '咖屋 · 今天想喝点什么',
      path: '/pages/order/order'
    }
  },

  onShareTimeline: function () {
    return { title: '咖屋 · 今天想喝点什么' }
  }
})
