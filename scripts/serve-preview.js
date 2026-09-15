/**
 * 本地开发脚本，不属于小程序包（已在 project.config.json 的 packOptions.ignore 中排除）。
 * 原来的 shebang 行已移除：小程序编译器会解析 miniprogramRoot 下的所有 .js，
 * 遇到 #! 会报 SyntaxError: Invalid or unexpected token，导致上传失败。
 * 用法：node scripts/serve-preview.js
 */
/**
 * 本地静态预览服务器。
 *
 * 微信开发者工具装不起来 / 没登录时，用浏览器也能看界面原型：
 *   node scripts/serve-preview.js         -> http://127.0.0.1:5173
 *   node scripts/serve-preview.js 8080    -> 指定端口
 *
 * 注意：它只服务 preview/ 目录下的网页原型，不是真的跑小程序。
 */
const http = require('http')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', 'preview')
const PORT = Number(process.argv[2] || process.env.PORT || 5173)
const HOST = '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0])
  if (urlPath === '/' || urlPath === '') urlPath = '/index.html'
  const filePath = path.join(ROOT, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ''))
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      return res.end('404 Not Found: ' + urlPath)
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' })
    res.end(buf)
  })
})

server.listen(PORT, HOST, () => {
  console.log(`咖屋界面预览: http://${HOST}:${PORT}`)
  console.log('按 Ctrl+C 停止')
})
