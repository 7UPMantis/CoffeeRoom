#!/usr/bin/env node
/**
 * 咖屋本地自检脚本（不依赖微信开发者工具）
 *
 * 微信开发者工具是 GUI + 扫码登录的，CI / 命令行环境下装不起来，
 * 这个脚本用纯 Node 把「编译器会帮你抓的那类错误」提前查一遍：
 *   1. JSON 全部可解析
 *   2. JS 全部语法通过（node --check）
 *   3. app.json 里登记的每个页面，四件套文件齐全
 *   4. WXML 里 bindtap / catchtap 绑定的方法，页面 JS 里确实存在
 *   5. tabBar / image 引用的本地图片文件存在
 *   6. WXML 标签闭合平衡
 *
 * 用法：node scripts/check-project.js
 * 退出码 0 = 通过，1 = 有问题（打印到 stderr）
 */
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const problems = []
const notes = []

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/')
}

function walk(dir, out) {
  out = out || []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'miniprogram_npm'].includes(e.name)) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const allFiles = walk(ROOT)

/* ---------- 1. JSON 可解析 ---------- */
const jsonFiles = allFiles.filter(f => f.endsWith('.json'))
for (const f of jsonFiles) {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch (e) {
    problems.push(`JSON 解析失败 ${rel(f)}: ${e.message}`)
  }
}

/* ---------- 2. JS 语法 ---------- */
const jsFiles = allFiles.filter(f => f.endsWith('.js'))
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
  } catch (e) {
    problems.push(`JS 语法错误 ${rel(f)}: ${String(e.stderr || e.message).split('\n')[0]}`)
  }
}

/* ---------- 3. 页面四件套齐全 ---------- */
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
const pages = appJson.pages || []
for (const p of pages) {
  for (const ext of ['js', 'json', 'wxml', 'wxss']) {
    const f = path.join(ROOT, `${p}.${ext}`)
    if (!fs.existsSync(f)) problems.push(`页面缺文件: ${p}.${ext}`)
  }
}

/* ---------- 4. WXML 事件绑定在 JS 中存在 ---------- */
const wxmlFiles = allFiles.filter(f => f.endsWith('.wxml'))
for (const wxml of wxmlFiles) {
  const jsPath = wxml.replace(/\.wxml$/, '.js')
  if (!fs.existsSync(jsPath)) {
    problems.push(`WXML 没有同名 JS: ${rel(wxml)}`)
    continue
  }
  const src = fs.readFileSync(wxml, 'utf8')
  const js = fs.readFileSync(jsPath, 'utf8')
  const re = /(?:bind|catch):?[a-zA-Z]+\s*=\s*"([^"]+)"/g
  const seen = new Set()
  let m
  while ((m = re.exec(src))) {
    const handler = m[1].trim()
    if (!handler || handler.indexOf('{{') > -1) continue // 动态绑定跳过
    if (seen.has(handler)) continue
    seen.add(handler)
    // 匹配 `handler: function` / `handler(` / `handler:` 三种写法
    const ok = new RegExp(`(^|[\\s,{])${handler}\\s*[:(]`, 'm').test(js)
    if (!ok) problems.push(`事件方法未定义: ${rel(wxml)} -> ${handler}`)
  }
}

/* ---------- 5. 本地图片引用存在 ---------- */
for (const p of pages) {
  const f = path.join(ROOT, `${p}.wxml`)
  if (!fs.existsSync(f)) continue
  const src = fs.readFileSync(f, 'utf8')
  // <image src="..."> 不带 {{ }} 的本地路径
  const re = /<image[^>]*\ssrc\s*=\s*"([^"{]+)"/g
  let m
  while ((m = re.exec(src))) {
    const s = m[1].trim()
    if (/^(https?:|cloud:|data:)/.test(s)) continue
    const target = s.startsWith('/') ? path.join(ROOT, s) : path.join(path.dirname(f), s)
    if (!fs.existsSync(target)) problems.push(`图片不存在: ${rel(f)} -> ${s}`)
  }
}

// tabBar 图标
for (const item of (appJson.tabBar && appJson.tabBar.list) || []) {
  for (const key of ['iconPath', 'selectedIconPath']) {
    if (!item[key]) continue
    const t = path.join(ROOT, item[key])
    if (!fs.existsSync(t)) problems.push(`tabBar 图标不存在: ${item[key]}`)
  }
}

/* ---------- 6. WXML 标签闭合平衡 ---------- */
const VOID_OK = new Set(['image', 'input', 'import', 'include', 'wxs', 'icon', 'progress', 'slider', 'switch', 'canvas', 'camera', 'video', 'audio', 'live-player', 'live-pusher', 'open-data', 'web-view', 'ad', 'official-account', 'navigation-bar', 'page-meta', 'keyboard-accessory', 'match-media', 'share-element', 'page-container', 'root-portal'])
for (const wxml of wxmlFiles) {
  let src = fs.readFileSync(wxml, 'utf8')
  src = src.replace(/<!--[\s\S]*?-->/g, '') // 去掉注释
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g
  const stack = []
  let m
  while ((m = re.exec(src))) {
    const closing = m[1] === '/'
    const tag = m[2]
    const selfClose = m[4] === '/'
    if (closing) {
      const top = stack.pop()
      if (top !== tag) {
        problems.push(`标签闭合不匹配: ${rel(wxml)} -> 期望 </${top || '?'}> 实际 </${tag}>`)
        break
      }
    } else if (!selfClose && !VOID_OK.has(tag)) {
      stack.push(tag)
    }
  }
  if (stack.length) problems.push(`标签未闭合: ${rel(wxml)} -> ${stack.join(' > ')}`)
}

/* ---------- 7. 提醒：云函数依赖 ---------- */
const cfRoot = path.join(ROOT, 'cloudfunctions')
if (fs.existsSync(cfRoot)) {
  for (const name of fs.readdirSync(cfRoot)) {
    const dir = path.join(cfRoot, name)
    if (!fs.statSync(dir).isDirectory()) continue
    if (!fs.existsSync(path.join(dir, 'node_modules'))) {
      notes.push(`云函数 ${name} 未安装依赖（本地调试需要）：cd cloudfunctions/${name} && npm install`)
    }
  }
}

/* ---------- 输出 ---------- */
console.log(`检查文件：JS ${jsFiles.length} · JSON ${jsonFiles.length} · WXML ${wxmlFiles.length}`)
console.log(`页面登记：${pages.length} 个 -> ${pages.join(', ')}`)
if (notes.length) {
  console.log('\n提示：')
  notes.forEach(n => console.log('  · ' + n))
}
if (problems.length) {
  console.error(`\n发现 ${problems.length} 个问题：`)
  problems.forEach(p => console.error('  ✗ ' + p))
  process.exit(1)
}
console.log('\n✓ 全部检查通过')
