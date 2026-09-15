const store = require('../../utils/store.js')
const util = require('../../utils/util.js')
const seed = require('../../utils/seed.js')
const stock = require('../../utils/stock.js')
const C = require('../../utils/constants.js')

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待制作' },
  { key: 'done', label: '已完成' }
]

Page({
  data: {
    orders: [],
    list: [],
    mode: '',
    modeText: '',
    envId: '',
    monthCount: 0,
    totalCount: 0,
    usedGrams: 0,
    // 看板
    chart: [],
    chartMax: 0,
    catStats: [],
    memberRank: [],
    topRecipes: [],
    // 筛选
    memberOptions: ['全部'],
    activeMember: '全部',
    statusFilters: STATUS_FILTERS,
    activeStatus: 'all'
  },

  onShow: function () {
    this.refreshMode()
    this.load()
  },

  onPullDownRefresh: function () {
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
    Promise.all([
      store.orders.list(),
      store.recipes.list(),
      store.beans.list()
    ]).then(function (res) {
      const orders = res[0] || []
      const recipes = res[1] || []
      const beans = res[2] || []

      const rmap = {}
      recipes.forEach(function (r) { rmap[r._id] = r })
      const bmap = {}
      beans.forEach(function (b) { bmap[b._id] = b })

      const now = new Date()
      const monthKey = now.getFullYear() + '-' + util.pad(now.getMonth() + 1)
      let monthCount = 0
      let totalCount = 0
      let usedGrams = 0

      const decorated = orders.map(function (o) {
        const d = new Date(o.createdAt || Date.now())
        const key = d.getFullYear() + '-' + util.pad(d.getMonth() + 1)
        const cups = o.totalCount || 0
        if (key === monthKey) monthCount += cups
        totalCount += cups

        const usage = o.beanUsage || []
        usage.forEach(function (u) { usedGrams += Number(u.grams) || 0 })

        return Object.assign({}, o, {
          _time: util.formatFull(o.createdAt),
          _dayKey: util.dateKey(o.createdAt),
          _summary: (o.items || []).map(function (i) {
            return i.name + '×' + i.count
          }).join('、'),
          _usageText: usage.length
            ? usage.map(function (u) {
              const b = bmap[u.beanId]
              return (b ? b.name : u.beanName) + ' −' + Math.round(u.grams) + 'g'
            }).join('，')
            : ''
        })
      })

      // ---- 近 7 日杯数 ----
      const days = util.recentDays(7)
      const dayMap = {}
      decorated.forEach(function (o) {
        dayMap[o._dayKey] = (dayMap[o._dayKey] || 0) + (o.totalCount || 0)
      })
      const chart = days.map(function (d) {
        return { label: d.label, date: d.date, cups: dayMap[d.key] || 0 }
      })
      const chartMax = chart.reduce(function (m, i) { return Math.max(m, i.cups) }, 0)
      chart.forEach(function (i) {
        i.h = chartMax > 0 ? Math.max(i.cups > 0 ? 8 : 0, Math.round((i.cups / chartMax) * 100)) : 0
      })

      // ---- 分类占比（按杯数）----
      const catMap = {}
      decorated.forEach(function (o) {
        ;(o.items || []).forEach(function (it) {
          const r = rmap[it.recipeId]
          const catKey = (r && r.category) || 'other'
          catMap[catKey] = (catMap[catKey] || 0) + (it.count || 0)
        })
      })
      const catTotal = Object.keys(catMap).reduce(function (s, k) { return s + catMap[k] }, 0)
      const catStats = Object.keys(catMap).map(function (k) {
        const c = C.categoryOf(k)
        const count = catMap[k]
        return {
          key: k,
          label: c.label,
          icon: c.icon,
          count: count,
          pct: catTotal > 0 ? Math.round((count / catTotal) * 100) : 0
        }
      }).sort(function (a, b) { return b.count - a.count })

      // ---- 成员排行（按杯数）----
      const memMap = {}
      decorated.forEach(function (o) {
        const who = (o.forWho || '不指定').trim() || '不指定'
        memMap[who] = (memMap[who] || 0) + (o.totalCount || 0)
      })
      const memberRank = Object.keys(memMap).map(function (k) {
        return { name: k, cups: memMap[k] }
      }).sort(function (a, b) { return b.cups - a.cups }).slice(0, 5)
      const memMax = memberRank.length ? memberRank[0].cups : 0
      memberRank.forEach(function (m) {
        m.pct = memMax > 0 ? Math.round((m.cups / memMax) * 100) : 0
      })

      // ---- 最常点 ----
      const recMap = {}
      decorated.forEach(function (o) {
        ;(o.items || []).forEach(function (it) {
          recMap[it.name] = (recMap[it.name] || 0) + (it.count || 0)
        })
      })
      const topRecipes = Object.keys(recMap).map(function (k) {
        return { name: k, count: recMap[k] }
      }).sort(function (a, b) { return b.count - a.count }).slice(0, 5)

      // ---- 成员筛选项 ----
      const memberOptions = ['全部'].concat(Object.keys(memMap).sort(function (a, b) {
        return memMap[b] - memMap[a]
      }))

      self.setData({
        orders: decorated,
        monthCount: monthCount,
        totalCount: totalCount,
        usedGrams: Math.round(usedGrams),
        chart: chart,
        chartMax: chartMax,
        catStats: catStats,
        memberRank: memberRank,
        topRecipes: topRecipes,
        memberOptions: memberOptions
      }, function () {
        self.applyFilter()
        if (done) done()
      })
    })
  },

  applyFilter: function () {
    const member = this.data.activeMember
    const status = this.data.activeStatus
    const list = this.data.orders.filter(function (o) {
      const who = (o.forWho || '不指定').trim() || '不指定'
      if (member !== '全部' && who !== member) return false
      if (status !== 'all' && (o.status || 'pending') !== status) return false
      return true
    })
    this.setData({ list: list })
  },

  onMemberTap: function (e) {
    this.setData({ activeMember: e.currentTarget.dataset.key }, this.applyFilter)
  },

  onStatusTap: function (e) {
    this.setData({ activeStatus: e.currentTarget.dataset.key }, this.applyFilter)
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
    const item = this.data.orders.find(function (o) { return o._id === id })
    if (!item) return
    const self = this
    const hasUsage = (item.beanUsage || []).length > 0
    wx.showModal({
      title: '删除记录',
      content: hasUsage
        ? '确定删除这条点单记录？\n删除后会把 ' + stock.usageText(item.beanUsage) + ' 还回豆仓。'
        : '确定删除这条点单记录？',
      confirmColor: '#E0483A',
      success: function (res) {
        if (!res.confirm) return
        wx.showLoading({ title: '处理中' })
        // 先回补豆量，再删记录，避免回补失败时数据不一致
        stock.restoreUsage(item.beanUsage).then(function () {
          return store.orders.remove(id)
        }).then(function () {
          wx.hideLoading()
          wx.showToast({ title: hasUsage ? '已删除并回补豆量' : '已删除', icon: 'none' })
          self.load()
        }).catch(function (err) {
          wx.hideLoading()
          wx.showToast({ title: '删除失败', icon: 'none' })
          console.error('[record] 删除失败', err)
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
  },

  onShareAppMessage: function () {
    return {
      title: '咖屋 · 我们家的咖啡记录',
      path: '/pages/order/order'
    }
  },

  onShareTimeline: function () {
    return { title: '咖屋 · 我们家的咖啡记录' }
  }
})
