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
    // 分组视图：常喝置顶 + 按分类分组，配方多时避免"滑 8 屏找"
    groups: [],
    grouped: false,   // 只有「全部 + 无搜索」时才分组；筛选/搜索时平铺
    collapsed: {},    // 用户手动折叠过的分类 { catKey: bool }
    // 待做队列：点单后的待制作清单，制作者在这里认领并向冲煮计时器交接
    queue: [],
    queueCups: 0
  },

  // 配方少于此数时不做折叠，避免"每类都要点开"的碎交互
  AUTO_EXPAND_LIMIT: 8,

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
        const tool = C.labelOf(C.TOOLS, r.tool)
        const ratio = util.ratioText(r.dose, r.water)
        // 把原本 4 个格子的大参数区压成一行文本，卡片高度省下约 40%
        const spec = []
        if (tool && tool !== '未设置') spec.push(tool)
        if (r.dose && r.water) spec.push(r.dose + 'g → ' + r.water + 'g')
        else if (r.dose) spec.push(r.dose + 'g')
        else if (r.water) spec.push(r.water + 'g')
        if (ratio) spec.push(ratio)
        if (r.temp) spec.push(r.temp + '℃')
        if (r.time) spec.push(r.time)

        return Object.assign({}, r, {
          _catLabel: cat.label,
          _catIcon: cat.icon,
          _toolLabel: tool,
          _ratio: ratio,
          _specLine: spec.join(' · '),
          // 标签行最多放 2 个自定义标签，避免卡片被标签撑高（完整标签在编辑页可看）
          _tags: (r.tags || []).slice(0, 2),
          _moreTags: Math.max(0, (r.tags || []).length - 2),
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
    const matched = this.data.all.filter(function (r) {
      if (activeCat !== 'all' && r.category !== activeCat) return false
      if (!kw) return true
      const hay = [r.name, r._catLabel, r._toolLabel, (r.tags || []).join(' '), r.beanName || ''].join(' ').toLowerCase()
      return hay.indexOf(kw) > -1
    })

    // 筛选或搜索时平铺：用户已经在找特定目标，再套分组只是噪音
    const filtering = activeCat !== 'all' || !!kw
    if (filtering) {
      this.setData({ list: matched, groups: [], grouped: false })
      return
    }

    const collapsed = this.data.collapsed || {}
    const autoExpand = matched.length <= this.AUTO_EXPAND_LIMIT

    function buildGroup(key, label, icon, items) {
      const userSet = collapsed[key]
      return {
        key: key,
        label: label,
        icon: icon,
        items: items,
        // 配方少时全展开；多了才默认折叠，但尊重用户手动设置过的状态
        collapsed: userSet === undefined ? !autoExpand : !!userSet
      }
    }

    const groups = []
    // 常喝置顶：家庭场景 80% 的点单集中在这几款，不该混进分类里翻
    const favs = matched.filter(function (r) { return r.favorite })
    if (favs.length) groups.push(buildGroup('__fav', '常喝', '★', favs))

    C.CATEGORIES.forEach(function (cat) {
      const items = matched.filter(function (r) { return r.category === cat.key && !r.favorite })
      if (items.length) groups.push(buildGroup(cat.key, cat.label, cat.icon, items))
    })

    // 兜底：分类不在枚举内的历史数据
    const known = C.CATEGORIES.map(function (c) { return c.key })
    const others = matched.filter(function (r) {
      return known.indexOf(r.category) === -1 && !r.favorite
    })
    if (others.length) groups.push(buildGroup('__other', '其他', '🍮', others))

    this.setData({ list: matched, groups: groups, grouped: true })
  },

  onToggleGroup: function (e) {
    const key = e.currentTarget.dataset.key
    const collapsed = Object.assign({}, this.data.collapsed)
    collapsed[key] = !collapsed[key]
    this.setData({ collapsed: collapsed }, this.applyFilter)
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
