const store = require('../../utils/store.js')
const C = require('../../utils/constants.js')
const util = require('../../utils/util.js')

Page({
  data: {
    isEdit: false,
    id: '',
    name: '',
    cover: '',
    category: 'milk',
    catList: C.CATEGORIES,
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
    ratio: '',
    note: '',
    favorite: false,
    steps: [''],
    tags: [],
    tagInput: ''
  },

  onLoad: function (opts) {
    this.setData({
      toolKeys: C.TOOLS.map(function (t) { return t.key }),
      toolLabels: C.TOOLS.map(function (t) { return t.label })
    })
    const self = this
    store.beans.list().then(function (beans) {
      const opts2 = [{ id: '', name: '' }].concat(beans.map(function (b) {
        return { id: b._id, name: b.name }
      }))
      self.setData({
        beanOptions: opts2,
        beanLabels: opts2.map(function (o) { return o.name || '不指定' })
      }, function () {
        if (opts && opts.id) self.loadRecipe(opts.id)
      })
    })
  },

  loadRecipe: function (id) {
    const self = this
    store.recipes.get(id).then(function (r) {
      if (!r) return
      const tools = self.data.toolKeys
      const bi = self.data.beanOptions.findIndex(function (o) { return o.id === r.beanId })
      self.setData({
        isEdit: true,
        id: id,
        name: r.name || '',
        cover: r.cover || '',
        category: r.category || 'milk',
        beanId: r.beanId || '',
        beanName: r.beanName || '',
        beanIndex: bi > -1 ? bi : 0,
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
        tags: r.tags || []
      })
      wx.setNavigationBarTitle({ title: '编辑配方' })
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
    this.setData({ category: e.currentTarget.dataset.key })
  },

  onBeanChange: function (e) {
    const i = Number(e.detail.value)
    const o = this.data.beanOptions[i] || { id: '', name: '' }
    this.setData({ beanIndex: i, beanId: o.id, beanName: o.name })
  },

  onToolChange: function (e) {
    this.setData({ toolIndex: Number(e.detail.value) })
  },

  onGrindChange: function (e) {
    this.setData({ grindIndex: Number(e.detail.value) })
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
    const payload = {
      name: d.name.trim(),
      cover: d.cover,
      category: d.category,
      beanId: d.beanId,
      beanName: d.beanName,
      tool: d.toolKeys[d.toolIndex],
      dose: Number(d.dose) || 0,
      water: Number(d.water) || 0,
      milk: Number(d.milk) || 0,
      grind: d.grindLabels[d.grindIndex],
      temp: Number(d.temp) || 0,
      time: d.time,
      note: d.note,
      favorite: d.favorite,
      steps: d.steps.map(function (s) { return (s || '').trim() }).filter(function (s) { return s }),
      tags: d.tags
    }
    const self = this
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
