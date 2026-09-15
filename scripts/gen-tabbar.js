/**
 * 生成小程序 tabBar 图标（81x81 PNG，透明背景）
 * 纯 Node 实现：自己编码 PNG，用距离场做抗锯齿，不依赖任何第三方库。
 * 用法: node gen-tabbar.js <输出目录>
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 81
const LW = 4.6 // 线宽

/* ---------------- PNG 编码 ---------------- */
let CRC_TABLE = null
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      CRC_TABLE[n] = c
    }
  }
  let c = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)
  return (c ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // RGBA
  const stride = w * 4 + 1
  const raw = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0 // filter: none
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4)
  }
  const idat = zlib.deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

/* ---------------- 距离场绘图 ---------------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v) }
function cover(d, w) { return clamp(w / 2 + 0.55 - d, 0, 1) }

function distSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1
  const l2 = dx * dx + dy * dy
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0
  t = clamp(t, 0, 1)
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

const seg = (x1, y1, x2, y2, w) => (px, py) => cover(distSeg(px, py, x1, y1, x2, y2), w || LW)

const circle = (cx, cy, r, w) => (px, py) => cover(Math.abs(Math.hypot(px - cx, py - cy) - r), w || LW)

// a0/a1 为弧度；屏幕坐标 y 向下，0=右，PI/2=下
const arc = (cx, cy, r, a0, a1, w) => (px, py) => {
  let ang = Math.atan2(py - cy, px - cx)
  let d = ang - a0
  while (d < 0) d += Math.PI * 2
  while (d >= Math.PI * 2) d -= Math.PI * 2
  if (d > (a1 - a0)) return 0
  return cover(Math.abs(Math.hypot(px - cx, py - cy) - r), w || LW)
}

const ellipse = (cx, cy, a, b, w) => (px, py) => {
  const v = Math.hypot((px - cx) / a, (py - cy) / b)
  return cover(Math.abs(v - 1) * Math.min(a, b), w || LW)
}

// 正弦曲线（咖啡豆中缝）
function wave(cx, yTop, yBot, amp, steps, w) {
  const out = []
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, t1 = (i + 1) / steps
    out.push(seg(
      cx + amp * Math.sin(2 * Math.PI * t0), yTop + (yBot - yTop) * t0,
      cx + amp * Math.sin(2 * Math.PI * t1), yTop + (yBot - yTop) * t1,
      w
    ))
  }
  return out
}

function render(shapes, rgb) {
  const buf = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const px = x + 0.5, py = y + 0.5
      let a = 0
      for (let i = 0; i < shapes.length; i++) {
        const c = shapes[i](px, py)
        if (c > a) { a = c; if (a >= 1) break }
      }
      if (a > 0) {
        const i = (y * SIZE + x) * 4
        buf[i] = rgb[0]
        buf[i + 1] = rgb[1]
        buf[i + 2] = rgb[2]
        buf[i + 3] = Math.round(a * 255)
      }
    }
  }
  return buf
}

/* ---------------- 图标形状 ---------------- */
const ICONS = {
  // 点单：咖啡杯（杯身 + 把手 + 蒸汽）
  order: [
    seg(25, 31, 56, 31),            // 杯口
    seg(25, 31, 30, 58),            // 左壁
    seg(30, 58, 51, 58),            // 杯底
    seg(56, 31, 51, 58),            // 右壁
    arc(55, 41, 7.5, -1.2, 1.2),    // 把手
    seg(34, 14, 34, 24),            // 蒸汽
    seg(40.5, 11.5, 40.5, 21.5),
    seg(47, 14, 47, 24)
  ],

  // 配方：圆角笔记
  recipe: [
    seg(29, 16, 52, 16),
    seg(29, 64, 52, 64),
    seg(24, 21, 24, 59),
    seg(57, 21, 57, 59),
    arc(29, 21, 5, Math.PI, Math.PI * 1.5),
    arc(52, 21, 5, Math.PI * 1.5, Math.PI * 2),
    arc(52, 59, 5, 0, Math.PI * 0.5),
    arc(29, 59, 5, Math.PI * 0.5, Math.PI),
    seg(32, 32, 49, 32),
    seg(32, 41, 49, 41),
    seg(32, 50, 43, 50)
  ],

  // 咖啡豆：椭圆 + 中缝
  bean: [
    ellipse(40.5, 40.5, 20, 25)
  ].concat(wave(40.5, 20, 61, 5.5, 26)),

  // 记录：时钟
  record: [
    circle(40.5, 40.5, 21),
    seg(40.5, 40.5, 40.5, 28),
    seg(40.5, 40.5, 51, 40.5)
  ]
}

const COLORS = {
  normal: [0xB5, 0xA4, 0x95],
  active: [0x6F, 0x4E, 0x37]
}

/* ---------------- 主流程 ---------------- */
const outDir = process.argv[2]
if (!outDir) {
  console.error('usage: node gen-tabbar.js <output-dir>')
  process.exit(1)
}
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

const made = []
Object.keys(ICONS).forEach(function (name) {
  ;[['normal', ''], ['active', '-on']].forEach(function (pair) {
    const state = pair[0]
    const suffix = pair[1]
    const file = path.join(outDir, 'tab-' + name + suffix + '.png')
    fs.writeFileSync(file, encodePNG(SIZE, SIZE, render(ICONS[name], COLORS[state])))
    made.push(path.basename(file))
  })
})

console.log('generated ' + made.length + ' icons in ' + outDir)
made.forEach(function (f) { console.log('  ' + f) })
