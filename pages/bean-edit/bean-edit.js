const store = require('../../utils/store.js')
const C = require('../../utils/constants.js')
const util = require('../../utils/util.js')

Page({
  data: {
    isEdit: false,
    id: '',
    name: '',
    origin: '',
    originPresets: C.PRESET_ORIGINS,
    processLabels: ['不指定'].concat(C.PROCESSES),
    processIndex: 0,
    roastLabels: [],
    roastIndex: 1,
    roastKeys: [],
    roastDate: util.dateStr(),
    weight: '',
    remaining: '',
    price: '',
    restDays: C.BEAN_DEFAULTS.restDays,
    peakDays: C.BEAN_DEFAULTS.peakDays,
    shelfDays: C.BEAN_DEFAULTS.shelfDays,
    // 用途标签：决定这支豆会出现在哪些配方里
    usageOptions: C.USAGE_TAGS,
    usageTags: [],
    // 风味：预置风味轮点选 + 自定义
    flavorPresets: C.PRESET_FLAVORS,
    flavor: [],
    flavorInput: '',
    note: '',
    today: util.dateStr(),
    preview: ''
  },

  onLoad: function (opts) {
    this.setData({
      roastKeys: C.ROASTS.map(function (r) { return r.key }),
      roastLabels: C.ROASTS.map(function (r) { return r.label })
    })
    if (opts && opts.id) this.loadBean(opts.id)
  },

  loadBean: function (id) {
    const self = this
    store.beans.get(id).then(function (b) {
      if (!b) return
      const ri = self.data.roastKeys.indexOf(b.roast)
      const pi = self.data.processLabels.indexOf(b.process)
      self.setData({
        isEdit: true,
        id: id,
        name: b.name || '',
        origin: b.origin || '',
        processIndex: pi > -1 ? pi : 0,
        roastIndex: ri > -1 ? ri : 1,
        roastDate: b.roastDate || util.dateStr(),
        weight: b.weight || '',
        remaining: b.remaining === undefined ? b.weight : b.remaining,
        price: b.price || '',
        restDays: b.restDays || C.BEAN_DEFAULTS.restDays,
        peakDays: b.peakDays || C.BEAN_DEFAULTS.peakDays,
        shelfDays: b.shelfDays || C.BEAN_DEFAULTS.shelfDays,
        usageTags: b.usageTags || [],
        flavor: b.flavor || [],
        note: b.note || ''
      }, function () {
        self.updatePreview()
        wx.setNavigationBarTitle({ title: '编辑咖啡豆' })
      })
    })
  },

  onInput: function (e) {
    const key = e.currentTarget.dataset.key
    const patch = {}
    patch[key] = e.detail.value
    this.setData(patch)
    if (['roastDate', 'restDays', 'peakDays', 'shelfDays'].indexOf(key) > -1) {
      this.updatePreview()
    }
  },

  onProcessChange: function (e) {
    this.setData({ processIndex: Number(e.detail.value) })
  },

  onRoastChange: function (e) {
    this.setData({ roastIndex: Number(e.detail.value) })
  },

  onDateChange: function (e) {
    this.setData({ roastDate: e.detail.value }, this.updatePreview)
  },

  updatePreview: function () {
    const d = this.data
    const bean = {
      roastDate: d.roastDate,
      restDays: d.restDays,
      peakDays: d.peakDays,
      shelfDays: d.shelfDays
    }
    const st = util.getBeanStatus(bean)
    let text = ''
    if (st.key === 'unknown') {
      text = '填写烘焙日期后自动计算养豆期与保质期'
    } else {
      text = '当前状态：' + st.label + '。' + st.tip
      if (st.endDate) text += '（节点 ' + st.endDate + '）'
    }
    this.setData({ preview: text })
  },

  // 用途标签多选
  onUsageToggle: function (e) {
    const key = e.currentTarget.dataset.key
    const tags = this.data.usageTags.slice()
    const i = tags.indexOf(key)
    if (i > -1) tags.splice(i, 1)
    else tags.push(key)
    this.setData({ usageTags: tags })
  },

  // 产地：预置点选（避免自由输入把同名产地写成好几个）
  onOriginPick: function (e) {
    const v = e.currentTarget.dataset.value
    this.setData({ origin: this.data.origin === v ? '' : v })
  },

  onFlavorInput: function (e) {
    this.setData({ flavorInput: e.detail.value })
  },

  // 风味：点预置风味轮标签，再点取消
  onFlavorPreset: function (e) {
    const v = e.currentTarget.dataset.value
    const list = this.data.flavor.slice()
    const i = list.indexOf(v)
    if (i > -1) list.splice(i, 1)
    else list.push(v)
    this.setData({ flavor: list })
  },

  onFlavorAdd: function () {
    const v = (this.data.flavorInput || '').trim()
    if (!v || this.data.flavor.indexOf(v) > -1) {
      this.setData({ flavorInput: '' })
      return
    }
    this.setData({ flavor: this.data.flavor.concat([v]), flavorInput: '' })
  },

  onFlavorDel: function (e) {
    const i = Number(e.currentTarget.dataset.index)
    const f = this.data.flavor.slice()
    f.splice(i, 1)
    this.setData({ flavor: f })
  },

  onUseAll: function () {
    this.setData({ remaining: this.data.weight })
  },

  onSave: function () {
    const d = this.data
    if (!(d.name || '').trim()) {
      wx.showToast({ title: '请填写咖啡豆名称', icon: 'none' })
      return
    }
    const w = Number(d.weight) || 0
    let left = Number(d.remaining)
    if (isNaN(left)) left = w
    if (left > w) left = w

    const payload = {
      name: d.name.trim(),
      origin: d.origin,
      process: d.processIndex === 0 ? '' : d.processLabels[d.processIndex],
      roast: d.roastKeys[d.roastIndex],
      roastDate: d.roastDate,
      weight: w,
      remaining: left,
      price: Number(d.price) || 0,
      restDays: Number(d.restDays) || C.BEAN_DEFAULTS.restDays,
      peakDays: Number(d.peakDays) || C.BEAN_DEFAULTS.peakDays,
      shelfDays: Number(d.shelfDays) || C.BEAN_DEFAULTS.shelfDays,
      usageTags: d.usageTags,
      flavor: d.flavor,
      note: d.note
    }
    // 没标用途的豆会出现在所有配方里，提醒一次但不阻止
    if (!d.usageTags.length) {
      const self = this
      wx.showModal({
        title: '还没标用途',
        content: '标上「意式 / 手冲 / 冷萃 / 通用」后，这支豆只会出现在对得上的配方里。现在保存的话，它会出现在所有配方中。',
        confirmText: '仍然保存',
        cancelText: '回去补标',
        success: function (res) {
          if (res.confirm) self.doSave(payload)
        }
      })
      return
    }
    this.doSave(payload)
  },

  doSave: function (payload) {
    const self = this
    const d = this.data
    wx.showLoading({ title: '保存中' })
    const task = d.isEdit ? store.beans.update(d.id, payload) : store.beans.add(payload)
    task.then(function () {
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
      setTimeout(function () { wx.navigateBack() }, 600)
    }).catch(function (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
      console.error(e)
    })
  },

  onDelete: function () {
    const self = this
    wx.showModal({
      title: '删除咖啡豆',
      content: '确定删除这支咖啡豆？',
      confirmColor: '#E0483A',
      success: function (res) {
        if (!res.confirm) return
        store.beans.remove(self.data.id).then(function () {
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(function () { wx.navigateBack() }, 600)
        })
      }
    })
  }
})
