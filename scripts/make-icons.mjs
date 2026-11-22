// Run: node scripts/make-icons.mjs (writes resources/icons)
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icons')
const SAMPLES = 4

const BG_TOP = [28, 28, 28]
const BG_BOTTOM = [4, 4, 4]
const BG = (_x, y) => BG_TOP.map((c, i) => c + (BG_BOTTOM[i] - c) * y)
const FG = [240, 240, 240]
const BADGE = [239, 68, 68]

const roundedRect = (x0, y0, x1, y1, r) => (x, y) => {
  const cx = Math.max(x0 + r, Math.min(x1 - r, x))
  const cy = Math.max(y0 + r, Math.min(y1 - r, y))
  return Math.hypot(x - cx, y - cy) <= r && x >= x0 && x <= x1 && y >= y0 && y <= y1
}
const circle = (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) <= r
const DIGITS = {
  0: ['111', '101', '101', '101', '111'],
  1: ['010', '110', '010', '010', '111'],
  2: ['111', '001', '111', '100', '111'],
  3: ['111', '001', '111', '001', '111'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '111', '001', '111'],
  6: ['111', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000']
}

/** Glyphs in a unit box (0..1), laid out in a 3x5 pixel font. */
function text(label, x0, y0, height) {
  const cell = height / 5
  const glyphWidth = cell * 3
  const gap = cell * 0.6
  const total = label.length * glyphWidth + (label.length - 1) * gap
  const left = x0 - total / 2
  return (x, y) => {
    const row = Math.floor((y - y0) / cell)
    if (row < 0 || row > 4) return false
    for (let i = 0; i < label.length; i++) {
      const gx = left + i * (glyphWidth + gap)
      const col = Math.floor((x - gx) / cell)
      if (col >= 0 && col <= 2 && DIGITS[label[i]][row][col] === '1') return true
    }
    return false
  }
}

/** Layers are [shape, rgb] in unit coordinates, painted in order. */
function render(size, layers) {
  const px = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rgb = [0, 0, 0]
      let alpha = 0
      for (const [shape, paint] of layers) {
        let hits = 0
        for (let sy = 0; sy < SAMPLES; sy++) {
          for (let sx = 0; sx < SAMPLES; sx++) {
            if (shape((x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size)) hits++
          }
        }
        const a = hits / (SAMPLES * SAMPLES)
        if (a === 0) continue
        const colour = typeof paint === 'function' ? paint((x + 0.5) / size, (y + 0.5) / size) : paint
        const outA = a + alpha * (1 - a)
        rgb = rgb.map((c, i) => (colour[i] * a + c * alpha * (1 - a)) / outA)
        alpha = outA
      }
      const o = (y * size + x) * 4
      px[o] = Math.round(rgb[0])
      px[o + 1] = Math.round(rgb[1])
      px[o + 2] = Math.round(rgb[2])
      px[o + 3] = Math.round(alpha * 255)
    }
  }
  return px
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

function ico(images) {
  const head = Buffer.alloc(6 + images.length * 16)
  head.writeUInt16LE(1, 2)
  head.writeUInt16LE(images.length, 4)
  let offset = head.length
  images.forEach(({ size, data }, i) => {
    const e = 6 + i * 16
    head[e] = size >= 256 ? 0 : size
    head[e + 1] = size >= 256 ? 0 : size
    head.writeUInt16LE(1, e + 4)
    head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(data.length, e + 8)
    head.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([head, ...images.map((i) => i.data)])
}

// "CC": a white C and a green C side by side on the dark tile.
const GREEN = [61, 255, 138]
const C_RADIUS = 29 / 256
const C_STROKE = 26 / 256
const MOUTH = (40 * Math.PI) / 180

const letterC = (cx, cy) => {
  const ends = [-1, 1].map((s) => [cx + C_RADIUS * Math.cos(MOUTH), cy + s * C_RADIUS * Math.sin(MOUTH)])
  return (x, y) => {
    const d = Math.hypot(x - cx, y - cy)
    if (Math.abs(d - C_RADIUS) <= C_STROKE / 2 && Math.abs(Math.atan2(y - cy, x - cx)) >= MOUTH) return true
    return ends.some(([ex, ey]) => Math.hypot(x - ex, y - ey) <= C_STROKE / 2)
  }
}

const appLayers = [
  [roundedRect(0.03, 0.03, 0.97, 0.97, 0.22), BG],
  [letterC(84 / 256, 126 / 256), FG],
  [letterC(172 / 256, 126 / 256), GREEN]
]
const trayBadgeLayers = (label) => [
  ...appLayers,
  [roundedRect(label.length > 1 ? 0.2 : 0.4, 0, 1, 0.6, 0.3), BADGE],
  [text(label, label.length > 1 ? 0.6 : 0.7, 0.1, 0.4), FG]
]
const overlayLayers = (label) => [
  [circle(0.5, 0.5, 0.5), BADGE],
  [text(label, 0.5, 0.26, 0.48), FG]
]

function write(name, size, layers) {
  const data = png(size, render(size, layers))
  writeFileSync(join(OUT, name), data)
  return data
}

mkdirSync(OUT, { recursive: true })
write('tray.png', 16, appLayers)
write('tray@2x.png', 32, appLayers)
for (const label of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '9+']) {
  const suffix = label === '9+' ? '9plus' : label
  write(`overlay-${suffix}.png`, 16, overlayLayers(label))
  write(`overlay-${suffix}@2x.png`, 32, overlayLayers(label))
  write(`tray-${suffix}.png`, 16, trayBadgeLayers(label))
  write(`tray-${suffix}@2x.png`, 32, trayBadgeLayers(label))
}
write('icon.png', 256, appLayers)
writeFileSync(
  join(OUT, 'icon.ico'),
  ico([16, 32, 48, 256].map((size) => ({ size, data: png(size, render(size, appLayers)) })))
)
console.log('icons written to', OUT)
