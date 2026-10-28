import { writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'

const rust = [154, 52, 18, 255]
const paper = [246, 241, 234, 255]
const ink = [36, 28, 24, 255]
const band = [196, 122, 58, 255]

function fill(png, x0, y0, w, h, color) {
  const x1 = Math.min(png.width, x0 + w)
  const y1 = Math.min(png.height, y0 + h)
  for (let y = Math.max(0, y0); y < y1; y += 1) {
    for (let x = Math.max(0, x0); x < x1; x += 1) {
      const i = (png.width * y + x) << 2
      png.data[i] = color[0]
      png.data[i + 1] = color[1]
      png.data[i + 2] = color[2]
      png.data[i + 3] = color[3]
    }
  }
}

function icon(size) {
  const png = new PNG({ width: size, height: size })
  fill(png, 0, 0, size, size, rust)
  const margin = Math.round(size * 0.22)
  const frameW = size - margin * 2
  const frameH = Math.round(frameW * 1.08)
  const frameX = margin
  const frameY = Math.round((size - frameH) / 2)
  fill(png, frameX, frameY, frameW, frameH, paper)
  const pad = Math.round(size * 0.055)
  fill(png, frameX + pad, frameY + pad, frameW - pad * 2, Math.round(frameH * 0.58), ink)
  fill(
    png,
    frameX + pad,
    frameY + pad + Math.round(frameH * 0.68),
    frameW - pad * 2,
    Math.max(2, Math.round(frameH * 0.07)),
    band,
  )
  return PNG.sync.write(png)
}

writeFileSync('public/icon-192.png', icon(192))
writeFileSync('public/icon-512.png', icon(512))
writeFileSync('public/apple-touch-icon.png', icon(180))
