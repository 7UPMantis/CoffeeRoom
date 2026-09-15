const store = require('../../utils/store.js')
const C = require('../../utils/constants.js')
const util = require('../../utils/util.js')
const stock = require('../../utils/stock.js')

// 哪些分类需要问「牛奶量」
const MILK_CATEGORIES = ['milk', 'cold', 'special']

Page({
  data: {
    isEdit: false,
    id: '',
    name: '',
    cover: '',
    category: 'milk',
    catList: C.CATEGORIES,
    // 所需豆用途：决定下单时能选哪些豆
    beanTypeOptions: [{ key: '', label: '自动', hint: '按器具推荐' }].concat(C.BEAN_TYPES),
    beanType: '',
    beanTypeLabel: '自动',
    // 默认豆（下单时仍可换）
    beanId: '',
    beanName: '',
    beanLabels: ['不指定'],
    beanIndex: 0,
    beanOptions: [],
    toolLabels: [],
    toolIndex: 0,
    toolKeys: [],
    grindLabels: C.GRINDS,
    grindIndex: 2,
    dose: '',
    water: '',
    milk: '',
    temp: '',
    time: '',
    timePresets: C.PRESET_TIMES,
    ratio: '',
    note: '',
    favorite: false,
    steps: [''],
    // 标签：预置点选 + 自定义
    tagPresets: C.PRESET_RECIPE_TAGS,
    tags: [],
    tagInput: '',
    showMilk: true
  },

  onLoad: function (opts) {
    this.setData({
      toolKeys: C.TOOLS.map(function (t) { return t.key }),
      toolLabels: C.TOOLS.map(function (t) { return t.label })
    })
    const self = this
    store.beans.list().then(function (beans) {
      self._beans = beans || []
      if (opts && opts.id) {
        self.loadRecipe(opts.id)
      } else {
        self.setData({ showMilk: MILK_CATEGORIES.indexOf(self.data.category) > -1 }, function () {
          self.refreshBeanOptions()
        })
      }
    })
  },

  // 有效所需豆用途：手动指定优先，否则按器具/分类推导
  effectiveBeanType: function () {
    const d = this.data
    if (d.beanType) return d.beanType
    return C.inferBeanType({ category: d.category, tool: d.toolKeys[d.toolIndex] })
  },

  refreshBeanOptions: function () {
    const d = this.data
    const type = this.effectiveBeanType()
    const opts = [{ id: '', name: '', label: '不指定', _unlabeled: false }].concat(
      stock.beansFor({ category: d.category, tool: d.toolKeys[d.toolIndex], beanType: type }, this._beans || [])
        .map(function (b) {
          return { id: b._id, name: b.name, label: b.name, _unlabeled: !!b._unlabeled }
        })
    )
    // 保留当前已选豆；不在列表里就退回「不指定」
    const bi = opts.findIndex(function (o) { return o.id === d.beanId })
    this.setData({
      beanOptions: opts,
      beanLabels: opts.map(function (o) { return o.label || '不指定' }),
      beanIndex: bi > -1 ? bi : 0,
      beanId: bi > -1 ? d.beanId : '',
      beanName: bi > -1 ? d.beanName : '',
      beanTypeLabel: C.beanTypeLabel(type)
    })
  },

  loadRecipe: function (id) {
    const self = this
    store.recipes.get(id).then(function (r) {
      if (!r) return
      const tools = self.data.toolKeys
      self.setData({
        isEdit: true,
        id: id,
        name: r.name || '',
        cover: r.cover || '',
        category: r.category || 'milk',
        beanType: r.beanType || '',
        beanId: r.beanId || '',
        beanName: r.beanName || '',
        toolIndex: tools.indexOf(r.tool) > -1 ? tools.indexOf(r.tool) : 0,
        grindIndex: C.GRINDS.indexOf(r.grind) > -1 ? C.GRINDS.indexOf(r.grind) : 2,
        dose: r.dose || '',
        water: r.water || '',
        milk: r.milk || '',
        temp: r.temp || '',
        time: r.time || '',
        ratio: util.ratioText(r.dose, r.water),
        note: r.note || '',
        favorite: !!r.favorite,
        steps: (r.steps && r.steps.length) ? r.steps : [''],
        tags: r.tags || [],
        showMilk: MILK_CATEGORIES.indexOf(r.category || 'milk') > -1
      }, function () {
        self.refreshBeanOptions()
        wx.setNavigationBarTitle({ title: '编辑配方' })
      })
    })
  },

  onInput: function (e) {
    const key = e.currentTarget.dataset.key
    const patch = {}
    patch[key] = e.detail.value
    this.setData(patch)
    if (key === 'dose' || key === 'water') {
      this.setData({ ratio: util.ratioText(this.data.dose, this.data.water) })
    }
  },

  onCatTap: function (e) {
    const category = e.currentTarget.dataset.key
    this.setData({
      category: category,
      showMilk: MILK_CATEGORIES.indexOf(category) > -1
    }, this.refreshBeanOptions)
  },

  onBeanTypeTap: function (e) {
    this.setData({ beanType: e.currentTarget.dataset.key }, this.refreshBeanOptions)
  },

  onBeanChange: function (e) {
    const i = Number(e.detail.value)
    const o = this.data.beanOptions[i] || { id: '', name: '' }
    this.setData({ beanIndex: i, beanId: o.id, beanName: o.name })
  },

  onToolChange: function (e) {
    this.setData({ toolIndex: Number(e.detail.value) }, this.refreshBeanOptions)
  },

  onGrindChange: function (e) {
    this.setData({ grindIndex: Number(e.detail.value) })
  },

  onTimePreset: function (e) {
    const v = e.currentTarget.dataset.value
    this.setData({ time: this.data.time === v ? '' : v })
  },

  onTagPreset: function (e) {
    const v = e.currentTarget.dataset.value
    const tags = this.data.tags.slice()
    const i = tags.indexOf(v)
    if (i > -1) tags.splice(i, 1)
    else tags.push(v)
    this.setData({ tags: tags })
  },

  onToggleFav: function () {
    this.setData({ favorite: !this.data.favorite })
  },

  onStepInput: function (e) {
    const i = Number(e.currentTarget.dataset.index)
    const patch = {}
    patch['steps[' + i + ']'] = e.detail.value
    this.setData(patch)
  },

  onStepAdd: function () {
    this.setData({ steps: this.data.steps.concat(['']) })
  },

  onStepDel: function (e) {
    const i = Number(e.currentTarget.dataset.index)
    const steps = this.data.steps.slice()
    steps.splice(i, 1)
    this.setData({ steps: steps.length ? steps : [''] })
  },

  onTagInput: function (e) {
    this.setData({ tagInput: e.detail.value })
  },

  onTagAdd: function () {
    const v = (this.data.tagInput || '').trim()
    if (!v) return
    if (this.data.tags.indexOf(v) > -1) {
      this.setData({ tagInput: '' })
      return
    }
    this.setData({ tags: this.data.tags.concat([v]), tagInput: '' })
  },

  onTagDel: function (e) {
    const i = Number(e.currentTarget.dataset.index)
    const tags = this.data.tags.slice()
    tags.splice(i, 1)
    this.setData({ tags: tags })
  },

  onChooseCover: function () {
    const self = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: function (res) {
        const file = res.tempFiles[0]
        store.mode().then(function (m) {
          if (m !== 'cloud') {
            self.setData({ cover: file.tempFilePath })
            return
          }
          wx.showLoading({ title: '上传中' })
          const suffix = (file.tempFilePath.match(/\.[a-zA-Z0-9]+$/) || ['.jpg'])[0]
          wx.cloud.uploadFile({
            cloudPath: 'coffee/recipe_' + Date.now() + suffix,
            filePath: file.tempFilePath
          }).then(function (up) {
            wx.hideLoading()
            self.setData({ cover: up.fileID })
          }).catch(function (err) {
            wx.hideLoading()
            wx.showToast({ title: '图片上传失败', icon: 'none' })
            console.error(err)
          })
        })
      }
    })
  },

  onSave: function () {
    const d = this.data
    if (!(d.name || '').trim()) {
      wx.showToast({ title: '请填写配方名称', icon: 'none' })
      return
    }
    if (!(d.dose > 0)) {
      wx.showToast({ title: '请填写咖啡粉用量', icon: 'none' })
      return
    }
    const payload = {
      name: d.name.trim(),
      cover: d.cover,
      category: d.category,
      beanType: d.beanType,
      beanId: d.beanId,
      beanName: d.beanName,
      tool: d.toolKeys[d.toolIndex],
      dose: Number(d.dose) || 0,
      water: Number(d.water) || 0,
      milk: d.showMilk ? (Number(d.milk) || 0) : 0,
      grind: d.grindLabels[d.grindIndex],
      temp: Number(d.temp) || 0,
      time: d.time,
      note: d.note,
      favorite: d.favorite,
      steps: d.steps.map(function (s) { return (s || '').trim() }).filter(function (s) { return s }),
      tags: d.tags
    }
    const self = this
    const finish = function () {
      wx.showLoading({ title: '保存中' })
      const task = d.isEdit ? store.recipes.update(d.id, payload) : store.recipes.add(payload)
      task.then(function () {
        wx.hideLoading()
        wx.showToast({ title: '已保存', icon: 'success' })
        setTimeout(function () { wx.navigateBack() }, 600)
      }).catch(function (e) {
        wx.hideLoading()
        wx.showToast({ title: '保存失败', icon: 'none' })
        console.error(e)
      })
    }
    // 没设默认豆：下单时照样能选，但提醒一下
    if (!d.beanId) {
      wx.showModal({
        title: '没设默认豆',
        content: '这款饮品没设默认豆，下单时再选也可以。现在设一个会更省事，要回去设吗？',
        confirmText: '回去设',
        cancelText: '就这样保存',
        success: function (res) {
          if (!res.confirm) finish()
        }
      })
      return
    }
    finish()
  },

  onDelete: function () {
    const self = this
    wx.showModal({
      title: '删除配方',
      content: '确定删除这个配方？',
      confirmColor: '#E0483A',
      success: function (res) {
        if (!res.confirm) return
        store.recipes.remove(self.data.id).then(function () {
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(function () { wx.navigateBack() }, 600)
        })
      }
    })
  }
})
