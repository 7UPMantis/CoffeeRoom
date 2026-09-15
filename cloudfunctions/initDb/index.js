const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 咖屋用到的三个集合
const COLLECTIONS = ['recipes', 'beans', 'orders']

exports.main = async () => {
  const result = []

  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name)
      result.push({ name, status: 'created' })
    } catch (err) {
      // 集合已存在时会报错，属于正常情况
      const msg = (err && err.message) || String(err)
      if (msg.indexOf('exist') > -1 || msg.indexOf('already') > -1 || msg.indexOf('-501001') > -1) {
        result.push({ name, status: 'exists' })
      } else {
        result.push({ name, status: 'error', message: msg })
      }
    }
  }

  return {
    ok: true,
    collections: result
  }
}
