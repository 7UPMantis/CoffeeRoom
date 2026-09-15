/**
 * 统一数据层：优先云开发数据库，不可用时自动降级到本地 Storage。
 * 上层页面只调用本模块的 API，无需关心当前是哪种模式。
 */
const LOCAL_PREFIX = 'coffee_'

let _mode = null // 'cloud' | 'local'
let _detecting = null

function collections() {
  return { RECIPE: 'recipes', BEAN: 'beans', ORDER: 'orders' }
}

// 探测并缓存可用模式
function detect() {
  if (_mode) return Promise.resolve(_mode)
  if (_detecting) return _detecting

  _detecting = new Promise(function (resolve) {
    const app = getApp()
    const envId = (app && app.globalData && app.globalData.envId) || ''
    if (!wx.cloud || !envId) {
      _mode = 'local'
      if (app) app.globalData.mode = 'local'
      return resolve('local')
    }
    try {
      if (app && !app.globalData.cloudReady) {
        wx.cloud.init({ env: envId, traceUser: true })
        app.globalData.cloudReady = true
      }
    } catch (e) {
      console.warn('[store] cloud init 失败', e)
    }
    wx.cloud.database().collection(collections().RECIPE).limit(1).get()
      .then(function () {
        _mode = 'cloud'
        if (app) app.globalData.mode = 'cloud'
        resolve('cloud')
      })
      .catch(function (e) {
        console.warn('[store] 云数据库不可用，降级本地存储', e)
        _mode = 'local'
        if (app) app.globalData.mode = 'local'
        resolve('local')
      })
  })
  return _detecting
}

function resetDetect() {
  _mode = null
  _detecting = null
}

function mode() {
  return detect()
}

/* ---------------- 本地存储实现 ---------------- */

function readLocal(name) {
  try {
    return wx.getStorageSync(LOCAL_PREFIX + name) || []
  } catch (e) {
    return []
  }
}

function writeLocal(name, list) {
  try {
    wx.setStorageSync(LOCAL_PREFIX + name, list)
  } catch (e) {
    console.error('[store] 本地写入失败', e)
  }
}

function genId() {
  return 'l_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* ---------------- 查询 ---------------- */

function applyFilter(list, where) {
  if (!where) return list
  const keys = Object.keys(where)
  if (!keys.length) return list
  return list.filter(function (row) {
    return keys.every(function (k) { return row[k] === where[k] })
  })
}

function applySort(list, order, desc) {
  const arr = list.slice()
  arr.sort(function (a, b) {
    const av = a[order] || 0
    const bv = b[order] || 0
    return desc ? bv - av : av - bv
  })
  return arr
}

// 小程序端单次 get 上限 20 条，循环翻页直到取够 cap 条
function fetchAllCloud(name, cap) {
  const db = wx.cloud.database()
  const PAGE = 20
  let skip = 0
  let acc = []
  function next() {
    return db.collection(name).skip(skip).limit(PAGE).get().then(function (res) {
      const data = res.data || []
      acc = acc.concat(data)
      skip += data.length
      if (data.length < PAGE || acc.length >= cap) return acc
      return next()
    })
  }
  return next()
}

/**
 * 查询列表。为避免云数据库 where+orderBy 的索引问题，统一一次性取回后在内存里过滤排序。
 */
function query(name, opts) {
  opts = opts || {}
  const where = opts.where || {}
  const order = opts.order || 'updatedAt'
  const desc = opts.desc !== false
  const limit = opts.limit || 100

  return detect().then(function (m) {
    if (m === 'cloud') {
      return fetchAllCloud(name, limit).then(function (list) {
        return applySort(applyFilter(list, where), order, desc).slice(0, limit)
      })
    }
    return Promise.resolve(applySort(applyFilter(readLocal(name), where), order, desc).slice(0, limit))
  })
}

function get(name, id) {
  return detect().then(function (m) {
    if (m === 'cloud') {
      return wx.cloud.database().collection(name).doc(id).get()
        .then(function (res) { return res.data })
        .catch(function () { return null })
    }
    const hit = readLocal(name).find(function (r) { return r._id === id })
    return Promise.resolve(hit || null)
  })
}

function add(name, data) {
  const now = Date.now()
  const doc = Object.assign({}, data, {
    createdAt: data.createdAt || now,
    updatedAt: now
  })
  return detect().then(function (m) {
    if (m === 'cloud') {
      return wx.cloud.database().collection(name).add({ data: doc })
        .then(function (res) { return res._id })
    }
    const list = readLocal(name)
    const id = genId()
    list.unshift(Object.assign({ _id: id }, doc))
    writeLocal(name, list)
    return Promise.resolve(id)
  })
}

function update(name, id, data) {
  const patch = Object.assign({}, data, { updatedAt: Date.now() })
  return detect().then(function (m) {
    if (m === 'cloud') {
      return wx.cloud.database().collection(name).doc(id).update({ data: patch })
        .then(function () { return true })
        .catch(function (e) { console.error('[store] update 失败', e); return false })
    }
    const list = readLocal(name)
    const idx = list.findIndex(function (r) { return r._id === id })
    if (idx > -1) {
      list[idx] = Object.assign({}, list[idx], patch)
      writeLocal(name, list)
    }
    return Promise.resolve(true)
  })
}

function remove(name, id) {
  return detect().then(function (m) {
    if (m === 'cloud') {
      return wx.cloud.database().collection(name).doc(id).remove()
        .then(function () { return true })
        .catch(function (e) { console.error('[store] remove 失败', e); return false })
    }
    const list = readLocal(name).filter(function (r) { return r._id !== id })
    writeLocal(name, list)
    return Promise.resolve(true)
  })
}

function addMany(name, arr) {
  const now = Date.now()
  return Promise.all(arr.map(function (d) {
    return add(name, Object.assign({}, d, { createdAt: d.createdAt || now }))
  }))
}

function count(name) {
  return query(name, { limit: 1000 }).then(function (l) { return l.length })
}

/* ---------------- 业务封装 ---------------- */

const C = collections()

const Recipes = {
  list: function (where) { return query(C.RECIPE, { where: where }) },
  get: function (id) { return get(C.RECIPE, id) },
  add: function (data) { return add(C.RECIPE, data) },
  update: function (id, data) { return update(C.RECIPE, id, data) },
  remove: function (id) { return remove(C.RECIPE, id) }
}

const Beans = {
  list: function () { return query(C.BEAN) },
  get: function (id) { return get(C.BEAN, id) },
  add: function (data) { return add(C.BEAN, data) },
  update: function (id, data) { return update(C.BEAN, id, data) },
  remove: function (id) { return remove(C.BEAN, id) }
}

const Orders = {
  list: function () { return query(C.ORDER, { order: 'createdAt' }) },
  add: function (data) { return add(C.ORDER, data) },
  update: function (id, data) { return update(C.ORDER, id, data) },
  remove: function (id) { return remove(C.ORDER, id) }
}

module.exports = {
  COLLECTIONS: C,
  mode: mode,
  resetDetect: resetDetect,
  query: query,
  recipes: Recipes,
  beans: Beans,
  orders: Orders,
  addMany: addMany,
  count: count
}
