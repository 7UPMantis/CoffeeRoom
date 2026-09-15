// 云开发环境 ID：在微信开发者工具「云开发」控制台创建环境后，把 env 填到这里。
// 留空则小程序自动降级为本地存储模式（数据只存在当前手机，不共享）。
const ENV_ID = 'cloud1-d9gprhrt7893ab698'

App({
  globalData: {
    envId: ENV_ID,
    mode: 'local', // 'cloud' | 'local'，由 utils/store.js 首次访问时探测
    cloudReady: false
  },

  onLaunch() {
    if (!wx.cloud) {
      console.warn('[咖屋] 当前基础库不支持云开发，使用本地存储模式')
      return
    }
    if (!ENV_ID) {
      console.warn('[咖屋] 未配置云环境 ID，使用本地存储模式')
      return
    }
    try {
      wx.cloud.init({ env: ENV_ID, traceUser: true })
      this.globalData.cloudReady = true
    } catch (e) {
      console.error('[咖屋] 云开发初始化失败，降级本地存储', e)
    }
  }
})
