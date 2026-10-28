import { jsPDF } from 'jspdf'
import boldUrl from './fonts/NotoSerif-Bold.ttf?url'
import italicUrl from './fonts/NotoSerif-Italic.ttf?url'
import regularUrl from './fonts/NotoSerif-Regular.ttf?url'
import { formatDate, formatSize, sortPaintings, todayISO } from './format.ts'
import type { Painting, PhotoRecord } from './types.ts'

export type PdfLayout = 'single' | 'grid'

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 40
const INK: Rgb = [36, 28, 24]
const MUTED: Rgb = [94, 86, 78]
const RUST: Rgb = [154, 52, 18]
const RULE: Rgb = [210, 196, 180]
const MAT: Rgb = [243, 237, 230]

type Rgb = readonly [number, number, number]
type EmbeddedImage = { dataUrl: string; width: number; height: number }

let fontCache: Promise<{ regular: string; bold: string; italic: string }> | null = null

export async function buildCatalogPdf(options: {
  catalogName: string
  paintings: Painting[]
  layout: PdfLayout
  getPhoto: (photoId: string) => Promise<PhotoRecord | undefined>
  onProgress?: (message: string) => void
}): Promise<Blob> {
  const catalogName = options.catalogName.trim() || 'Painting Catalog'
  const paintings = sortPaintings(options.paintings, 'itemNumber', 'asc')
  options.onProgress?.('Loading fonts…')
  const fonts = await loadFonts()
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true })
  doc.addFileToVFS('NotoSerif-Regular.ttf', fonts.regular)
  doc.addFileToVFS('NotoSerif-Bold.ttf', fonts.bold)
  doc.addFileToVFS('NotoSerif-Italic.ttf', fonts.italic)
  doc.addFont('NotoSerif-Regular.ttf', 'NotoSerif', 'normal', 400, 'Identity-H')
  doc.addFont('NotoSerif-Bold.ttf', 'NotoSerif', 'bold', 700, 'Identity-H')
  doc.addFont('NotoSerif-Italic.ttf', 'NotoSerif', 'italic', 400, 'Identity-H')
  doc.setLineHeightFactor(1.25)
  doc.setProperties({
    title: catalogName,
    subject: 'Painting storage catalog',
    creator: 'Painting Catalog',
  })

  drawTitlePage(doc, catalogName, paintings.length, options.layout)

  if (options.layout === 'single') {
    for (let index = 0; index < paintings.length; index += 1) {
      const painting = paintings[index]
      if (!painting) continue
      options.onProgress?.(`Painting ${index + 1} of ${paintings.length}…`)
      await yieldToUi()
      doc.addPage()
      const image = await loadImage(painting, 'full', options.getPhoto)
      drawSinglePage(doc, painting, image)
    }
  } else {
    const perPage = 6
    const pages = Math.ceil(paintings.length / perPage)
    for (let page = 0; page < pages; page += 1) {
      const slice = paintings.slice(page * perPage, page * perPage + perPage)
      options.onProgress?.(`Page ${page + 1} of ${pages}…`)
      await yieldToUi()
      doc.addPage()
      const images = new Map<string, EmbeddedImage | null>()
      for (const painting of slice) {
        images.set(painting.id, await loadImage(painting, 'thumb', options.getPhoto))
      }
      drawGridPage(doc, catalogName, slice, images)
    }
  }

  drawFooters(doc)
  const raw = doc.output('blob')
  return raw.type === 'application/pdf' ? raw : new Blob([raw], { type: 'application/pdf' })
}

async function loadFonts(): Promise<{ regular: string; bold: string; italic: string }> {
  fontCache ??= Promise.all([
    fontBase64(regularUrl),
    fontBase64(boldUrl),
    fontBase64(italicUrl),
  ]).then(([regular, bold, italic]) => ({ regular, bold, italic }))
  return fontCache
}

async function fontBase64(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('Could not load the catalog font.')
  const bytes = new Uint8Array(await response.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function drawTitlePage(doc: jsPDF, catalogName: string, count: number, layout: PdfLayout) {
  drawBar(doc)
  applyFont(doc, 'normal', 12, RUST)
  doc.text('STORAGE INVENTORY', MARGIN, 210)
  applyFont(doc, 'bold', 34, INK)
  const title = doc.splitTextToSize(catalogName, PAGE_W - MARGIN * 2).slice(0, 3)
  doc.text(title, MARGIN, 258)
  const afterTitle = 258 + title.length * 34 * 1.25
  doc.setDrawColor(...RULE)
  doc.setLineWidth(1)
  doc.line(MARGIN, afterTitle, PAGE_W - MARGIN, afterTitle)
  applyFont(doc, 'italic', 14, MUTED)
  doc.text(`Exported ${formatDate(todayISO())}`, MARGIN, afterTitle + 36)
  applyFont(doc, 'normal', 14, INK)
  doc.text(count === 1 ? '1 painting' : `${count} paintings`, MARGIN, afterTitle + 60)
  applyFont(doc, 'normal', 12, MUTED)
  doc.text('Ordered by item number.', MARGIN, afterTitle + 84)
  doc.text(
    layout === 'single' ? 'One painting per page.' : 'Six paintings per page.',
    MARGIN,
    afterTitle + 104,
  )
  applyFont(doc, 'normal', 11, MUTED)
  const note = doc.splitTextToSize(
    'Photos and records stay on this device. This PDF is a snapshot you can share or file.',
    PAGE_W - MARGIN * 2,
  )
  doc.text(note, MARGIN, 700)
}

function drawSinglePage(doc: jsPDF, painting: Painting, image: EmbeddedImage | null) {
  drawBar(doc)
  const box = { x: MARGIN, y: 28, w: PAGE_W - MARGIN * 2, h: 360 }
  drawPhoto(doc, image, box, `full-${painting.id}`)
  let y = 414
  applyFont(doc, 'normal', 11, RUST)
  doc.text(`NO. ${painting.itemNumber}`, MARGIN, y)
  y += 28
  applyFont(doc, 'bold', 22, INK)
  const title = doc.splitTextToSize(painting.title || 'Untitled', PAGE_W - MARGIN * 2).slice(0, 2)
  doc.text(title, MARGIN, y)
  y += title.length * 22 * 1.25 + 6
  applyFont(doc, 'italic', 13, MUTED)
  doc.text(painting.artist || 'Artist not set', MARGIN, y)
  y += 28
  const rows: Array<[string, string]> = [
    ['Dimensions', formatSize(painting) || 'Not set'],
    ['Medium', painting.medium || 'Not set'],
    ['Location', painting.location || 'Not set'],
    ['Date added', formatDate(painting.dateAdded) || 'Not set'],
  ]
  for (const [label, value] of rows) {
    if (y > 700) break
    applyFont(doc, 'normal', 11, RUST)
    doc.text(label, MARGIN, y)
    applyFont(doc, 'normal', 11, INK)
    const lines = doc.splitTextToSize(value, 390).slice(0, 2)
    doc.text(lines, MARGIN + 110, y)
    y += Math.max(lines.length, 1) * 11 * 1.25 + 8
  }
  if (painting.notes && y < 730) {
    y += 6
    applyFont(doc, 'normal', 11, RUST)
    doc.text('Notes', MARGIN, y)
    y += 16
    applyFont(doc, 'normal', 11, INK)
    const lines = doc.splitTextToSize(painting.notes, PAGE_W - MARGIN * 2)
    const room = Math.max(0, Math.floor((748 - y) / (11 * 1.25)))
    if (room > 0) doc.text(lines.slice(0, room), MARGIN, y)
  }
}

function drawGridPage(
  doc: jsPDF,
  catalogName: string,
  paintings: Painting[],
  images: Map<string, EmbeddedImage | null>,
) {
  drawBar(doc)
  applyFont(doc, 'normal', 10, MUTED)
  doc.text(oneLine(doc, catalogName, 360), MARGIN, 28)
  doc.text('Six per page', PAGE_W - MARGIN, 28, { align: 'right' })

  const cols = 2
  const rows = 3
  const gapX = 16
  const gapY = 12
  const top = 44
  const usableW = PAGE_W - MARGIN * 2
  const usableH = 748 - top
  const cellW = (usableW - gapX) / cols
  const cellH = (usableH - gapY * (rows - 1)) / rows

  paintings.forEach((painting, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = MARGIN + col * (cellW + gapX)
    const y = top + row * (cellH + gapY)
    const photoH = cellH - 68
    drawPhoto(doc, images.get(painting.id) ?? null, { x, y, w: cellW, h: photoH }, `grid-${painting.id}`)
    let textY = y + photoH + 16
    applyFont(doc, 'bold', 11, RUST)
    doc.text(`No. ${painting.itemNumber}`, x, textY)
    textY += 15
    applyFont(doc, 'normal', 11, INK)
    const title = doc.splitTextToSize(painting.title || 'Untitled', cellW).slice(0, 2)
    doc.text(title, x, textY)
    textY += title.length * 11 * 1.25 + 2
    applyFont(doc, 'normal', 10, MUTED)
    doc.text(oneLine(doc, formatSize(painting) || 'Size not set', cellW), x, textY)
  })
}

function drawPhoto(
  doc: jsPDF,
  image: EmbeddedImage | null,
  box: { x: number; y: number; w: number; h: number },
  alias: string,
) {
  doc.setFillColor(...MAT)
  doc.rect(box.x, box.y, box.w, box.h, 'F')
  if (!image) {
    applyFont(doc, 'normal', 11, MUTED)
    doc.text('No photo', box.x + box.w / 2, box.y + box.h / 2, { align: 'center' })
    return
  }
  const scale = Math.min(box.w / image.width, box.h / image.height)
  const width = image.width * scale
  const height = image.height * scale
  const x = box.x + (box.w - width) / 2
  const y = box.y + (box.h - height) / 2
  try {
    doc.addImage(image.dataUrl, 'JPEG', x, y, width, height, alias, 'FAST')
  } catch {
    applyFont(doc, 'normal', 11, MUTED)
    doc.text('Photo unavailable', box.x + box.w / 2, box.y + box.h / 2, { align: 'center' })
  }
}

function drawBar(doc: jsPDF) {
  doc.setFillColor(...INK)
  doc.rect(0, 0, PAGE_W, 8, 'F')
}

function drawFooters(doc: jsPDF) {
  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    applyFont(doc, 'normal', 9, MUTED)
    doc.text(String(page), PAGE_W / 2, PAGE_H - 20, { align: 'center' })
  }
}

async function loadImage(
  painting: Painting,
  which: 'full' | 'thumb',
  getPhoto: (photoId: string) => Promise<PhotoRecord | undefined>,
): Promise<EmbeddedImage | null> {
  if (!painting.photoId) return null
  try {
    const photo = await getPhoto(painting.photoId)
    const blob = which === 'full' ? photo?.full : (photo?.thumb ?? photo?.full)
    if (!blob) return null
    const bitmap = await createImageBitmap(blob)
    const width = bitmap.width
    const height = bitmap.height
    bitmap.close()
    const dataUrl = await blobToDataUrl(blob)
    return { dataUrl, width, height }
  } catch {
    return null
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read a photo.'))
    reader.readAsDataURL(blob)
  })
}

function applyFont(doc: jsPDF, style: 'normal' | 'bold' | 'italic', size: number, color: Rgb) {
  doc.setFont('NotoSerif', style, style === 'bold' ? 700 : 400)
  doc.setFontSize(size)
  doc.setTextColor(color[0], color[1], color[2])
}

function oneLine(doc: jsPDF, text: string, maxWidth: number): string {
  const lines = doc.splitTextToSize(text, maxWidth)
  const first = lines[0] ?? ''
  if (lines.length < 2) return first
  let line = first
  while (line.length > 0 && doc.getTextWidth(`${line}…`) > maxWidth) line = line.slice(0, -1)
  return `${line}…`
}

function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}
