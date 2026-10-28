import { savePainting, nextItemNumber } from './db.ts'
import { todayISO } from './format.ts'
import { canvasToJpeg, thumbFromCanvas } from './images.ts'
import type { Painting } from './types.ts'

type Spec = {
  title: string
  artist: string
  width: number
  height: number
  depth: number | null
  medium: string
  location: string
  notes: string
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
}

const SPECS: Spec[] = [
  {
    title: 'North Window Study',
    artist: 'A. Calderon',
    width: 24,
    height: 30,
    depth: 1.5,
    medium: 'Oil on linen',
    location: 'Rack A, slot 3',
    notes: 'Sample placeholder. Not a real painting. Wrapped in glassine. Frame is oak.',
    paint(ctx, w, h) {
      ctx.fillStyle = '#d5dde3'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#8ea4b3'
      ctx.fillRect(w * 0.12, h * 0.08, w * 0.46, h * 0.78)
      ctx.fillStyle = '#f4efe6'
      ctx.fillRect(w * 0.42, h * 0.18, w * 0.46, h * 0.28)
      ctx.fillStyle = '#c47a3a'
      ctx.fillRect(w * 0.18, h * 0.72, w * 0.7, Math.max(2, h * 0.015))
    },
  },
  {
    title: 'Red Over Plaster',
    artist: 'M. Ibarra',
    width: 18,
    height: 18,
    depth: null,
    medium: 'Acrylic on panel',
    location: 'Flat file 2',
    notes: 'Sample placeholder. Not a real painting. Unframed. Keep flat.',
    paint(ctx, w, h) {
      ctx.fillStyle = '#e6d3c4'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#9a3412'
      ctx.fillRect(w * 0.18, h * 0.2, w * 0.55, h * 0.5)
      ctx.fillStyle = '#f7f1ea'
      ctx.fillRect(w * 0.46, h * 0.36, w * 0.3, h * 0.18)
    },
  },
  {
    title: 'Harbor Gray',
    artist: 'A. Calderon',
    width: 36,
    height: 24,
    depth: 2,
    medium: 'Oil on canvas',
    location: 'Rack B, slot 1',
    notes: 'Sample placeholder. Not a real painting.',
    paint(ctx, w, h) {
      ctx.fillStyle = '#c5cfcb'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#6e7f78'
      ctx.fillRect(0, h * 0.62, w, h * 0.38)
      ctx.fillStyle = '#f7f4ef'
      ctx.fillRect(0, h * 0.58, w, Math.max(3, h * 0.035))
    },
  },
  {
    title: 'Late Garden',
    artist: 'S. Nguyen',
    width: 12.5,
    height: 16,
    depth: null,
    medium: 'Gouache on paper',
    location: 'Drawer 4',
    notes: 'Sample placeholder. Not a real painting. Under glass. Do not stack.',
    paint(ctx, w, h) {
      ctx.fillStyle = '#e7efe4'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#2f4a3c'
      ctx.fillRect(w * 0.16, h * 0.18, w * 0.22, h * 0.58)
      ctx.fillStyle = '#d36b5b'
      ctx.beginPath()
      ctx.arc(w * 0.68, h * 0.4, Math.min(w, h) * 0.16, 0, Math.PI * 2)
      ctx.fill()
    },
  },
  {
    title: 'Untitled (Ochre)',
    artist: 'Unknown',
    width: 20,
    height: 20,
    depth: 1,
    medium: 'Mixed media',
    location: 'Bin C',
    notes: 'Sample placeholder. Not a real painting. No signature on the verso.',
    paint(ctx, w, h) {
      ctx.fillStyle = '#e0b15a'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#3a2a1c'
      ctx.beginPath()
      ctx.arc(w * 0.5, h * 0.46, Math.min(w, h) * 0.22, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#f6f1ea'
      ctx.fillRect(w * 0.18, h * 0.78, w * 0.64, Math.max(2, h * 0.02))
    },
  },
  {
    title: 'Night Orchard',
    artist: 'S. Nguyen',
    width: 30,
    height: 40,
    depth: 1.75,
    medium: 'Oil on canvas',
    location: 'Rack A, slot 7',
    notes: 'Sample placeholder. Not a real painting. Small nick on the lower right stretcher.',
    paint(ctx, w, h) {
      ctx.fillStyle = '#1c2430'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#3d5c49'
      ctx.fillRect(w * 0.18, h * 0.28, w * 0.12, h * 0.6)
      ctx.fillRect(w * 0.4, h * 0.16, w * 0.1, h * 0.72)
      ctx.fillRect(w * 0.58, h * 0.34, w * 0.14, h * 0.54)
      ctx.fillStyle = '#f3efe4'
      ctx.beginPath()
      ctx.arc(w * 0.78, h * 0.2, Math.min(w, h) * 0.08, 0, Math.PI * 2)
      ctx.fill()
    },
  },
]

export async function addSamplePaintings(): Promise<number> {
  let itemNumber = await nextItemNumber()
  const dateAdded = todayISO()
  for (const spec of SPECS) {
    const { width, height } = pixelSize(spec.width, spec.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not draw a sample painting.')
    spec.paint(ctx, width, height)
    frame(ctx, width, height)
    const full = await canvasToJpeg(canvas, 0.85)
    const thumb = await thumbFromCanvas(canvas)
    const photoId = crypto.randomUUID()
    const painting: Painting = {
      id: crypto.randomUUID(),
      itemNumber,
      title: spec.title,
      artist: spec.artist,
      width: spec.width,
      height: spec.height,
      depth: spec.depth,
      medium: spec.medium,
      location: spec.location,
      notes: spec.notes,
      dateAdded,
      photoId,
    }
    await savePainting(painting, { kind: 'set', photo: { id: photoId, full, thumb } })
    itemNumber += 1
  }
  return SPECS.length
}

function pixelSize(widthIn: number, heightIn: number, maxEdge = 1200) {
  const scale = maxEdge / Math.max(widthIn, heightIn)
  return {
    width: Math.max(1, Math.round(widthIn * scale)),
    height: Math.max(1, Math.round(heightIn * scale)),
  }
}

function frame(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = 'rgba(36, 28, 24, 0.35)'
  ctx.lineWidth = Math.max(2, Math.round(Math.min(w, h) * 0.012))
  const inset = ctx.lineWidth * 2
  ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2)
}
