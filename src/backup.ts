import JSZip from 'jszip'
import { cleanLine, cleanNotes, isSafeId, todayISO } from './format.ts'
import { thumbFromBlob } from './images.ts'
import type { Painting, ParsedBackup, PhotoRecord } from './types.ts'

export const BACKUP_FORMAT = 'painting-catalog'
const MAX_FILE_BYTES = 400 * 1024 * 1024
const MAX_PAINTINGS = 5000

export async function buildZip(data: {
  catalogName: string
  paintings: Painting[]
  photos: PhotoRecord[]
}): Promise<Blob> {
  const zip = new JSZip()
  zip.file('catalog.json', JSON.stringify(catalogDocument(data), null, 2), { compression: 'DEFLATE' })
  const photos = zip.folder('photos')
  const thumbs = zip.folder('thumbs')
  if (!photos || !thumbs) throw new Error('Could not build the backup.')
  for (const photo of data.photos) {
    photos.file(`${photo.id}.jpg`, photo.full, { compression: 'STORE' })
    thumbs.file(`${photo.id}.jpg`, photo.thumb, { compression: 'STORE' })
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  return new Blob([blob], { type: 'application/zip' })
}

export async function buildJson(data: {
  catalogName: string
  paintings: Painting[]
  photos: PhotoRecord[]
}): Promise<Blob> {
  const photos = []
  for (const photo of data.photos) {
    photos.push({
      id: photo.id,
      full: await blobToBase64(photo.full),
      thumb: await blobToBase64(photo.thumb),
    })
  }
  const json = JSON.stringify({ ...catalogDocument(data), photos }, null, 2)
  return new Blob([json], { type: 'application/json' })
}

export async function parseBackup(file: File): Promise<ParsedBackup> {
  if (file.size > MAX_FILE_BYTES) throw new Error('That backup is larger than 400 MB.')
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const isZip =
    file.name.toLowerCase().endsWith('.zip') ||
    file.type === 'application/zip' ||
    (bytes[0] === 0x50 && bytes[1] === 0x4b)
  if (isZip) return parseZip(buffer)
  return parseJson(new TextDecoder().decode(buffer))
}

function catalogDocument(data: { catalogName: string; paintings: Painting[] }) {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    catalogName: data.catalogName,
    paintings: data.paintings,
  }
}

async function parseZip(buffer: ArrayBuffer): Promise<ParsedBackup> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    throw new Error('That zip could not be read.')
  }
  const catalogFile = zip.file('catalog.json')
  if (!catalogFile) throw new Error('That zip is not a Painting Catalog backup.')
  const parsed = parseCatalog(JSON.parse(await catalogFile.async('string')) as unknown)
  const photos: PhotoRecord[] = []
  let missingPhotos = 0
  for (const painting of parsed.paintings) {
    if (!painting.photoId) continue
    const fullFile = zip.file(`photos/${painting.photoId}.jpg`)
    if (!fullFile) {
      painting.photoId = null
      missingPhotos += 1
      continue
    }
    const full = await fullFile.async('blob')
    const thumbFile = zip.file(`thumbs/${painting.photoId}.jpg`)
    let thumb: Blob
    try {
      thumb = thumbFile ? await thumbFile.async('blob') : await thumbFromBlob(typedJpeg(full))
      if (thumb.size === 0) thumb = await thumbFromBlob(typedJpeg(full))
    } catch {
      painting.photoId = null
      missingPhotos += 1
      continue
    }
    photos.push({ id: painting.photoId, full: typedJpeg(full), thumb })
  }
  return { ...parsed, photos, missingPhotos }
}

async function parseJson(text: string): Promise<ParsedBackup> {
  let raw: unknown
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    throw new Error('That file is not a Painting Catalog backup.')
  }
  const parsed = parseCatalog(raw)
  const record = asRecord(raw)
  const photoList = Array.isArray(record.photos) ? record.photos : []
  const byId = new Map<string, { full?: string; thumb?: string }>()
  for (const entry of photoList) {
    if (!entry || typeof entry !== 'object') continue
    const photo = entry as Record<string, unknown>
    if (typeof photo.id !== 'string' || !isSafeId(photo.id)) continue
    byId.set(photo.id, {
      full: typeof photo.full === 'string' ? photo.full : undefined,
      thumb: typeof photo.thumb === 'string' ? photo.thumb : undefined,
    })
  }
  const photos: PhotoRecord[] = []
  let missingPhotos = 0
  for (const painting of parsed.paintings) {
    if (!painting.photoId) continue
    const encoded = byId.get(painting.photoId)
    if (!encoded?.full) {
      painting.photoId = null
      missingPhotos += 1
      continue
    }
    try {
      const full = base64ToBlob(encoded.full, 'image/jpeg')
      const thumb = encoded.thumb
        ? base64ToBlob(encoded.thumb, 'image/jpeg')
        : await thumbFromBlob(full)
      photos.push({ id: painting.photoId, full, thumb })
    } catch {
      painting.photoId = null
      missingPhotos += 1
    }
  }
  return { ...parsed, photos, missingPhotos }
}

function parseCatalog(raw: unknown): Omit<ParsedBackup, 'photos' | 'missingPhotos'> {
  const record = asRecord(raw)
  if (record.format !== BACKUP_FORMAT) {
    throw new Error('That file is not a Painting Catalog backup.')
  }
  if (record.version !== 1) throw new Error('That backup is from a newer version of the app.')
  if (!Array.isArray(record.paintings)) throw new Error('That backup has no paintings list.')
  if (record.paintings.length > MAX_PAINTINGS) {
    throw new Error('That backup has too many paintings.')
  }
  const paintings = record.paintings.map((entry) => parsePainting(entry))
  const ids = new Set<string>()
  const numbers = new Set<number>()
  for (const painting of paintings) {
    if (ids.has(painting.id)) throw new Error('That backup repeats a painting id.')
    if (numbers.has(painting.itemNumber)) {
      throw new Error(`That backup has two paintings numbered ${painting.itemNumber}.`)
    }
    ids.add(painting.id)
    numbers.add(painting.itemNumber)
  }
  const catalogName =
    typeof record.catalogName === 'string' && record.catalogName.trim()
      ? cleanLine(record.catalogName, 120)
      : 'Painting Catalog'
  const exportedAt = typeof record.exportedAt === 'string' ? record.exportedAt : null
  return { catalogName, exportedAt, paintings }
}

function parsePainting(raw: unknown): Painting {
  const record = asRecord(raw)
  if (typeof record.id !== 'string' || !isSafeId(record.id)) {
    throw new Error('That backup has a painting with an invalid id.')
  }
  const itemNumber = requiredItemNumber(record.itemNumber)
  const photoId =
    record.photoId == null || record.photoId === ''
      ? null
      : typeof record.photoId === 'string' && isSafeId(record.photoId)
        ? record.photoId
        : null
  return {
    id: record.id,
    itemNumber,
    title: typeof record.title === 'string' ? cleanLine(record.title, 200) : '',
    artist: typeof record.artist === 'string' ? cleanLine(record.artist, 200) : '',
    width: optionalInches(record.width),
    height: optionalInches(record.height),
    depth: optionalInches(record.depth),
    medium: typeof record.medium === 'string' ? cleanLine(record.medium, 200) : '',
    location: typeof record.location === 'string' ? cleanLine(record.location, 200) : '',
    notes: typeof record.notes === 'string' ? cleanNotes(record.notes) : '',
    dateAdded: normalizeDate(record.dateAdded),
    photoId,
  }
}

function requiredItemNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(number) || number < 1 || number > 999999) {
    throw new Error('That backup has a painting without a usable item number.')
  }
  return number
}

function optionalInches(value: unknown): number | null {
  if (value == null || value === '') return null
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(number) || number <= 0 || number > 2000) {
    throw new Error('A painting has a dimension that is not a positive number of inches.')
  }
  return Math.round(number * 1000) / 1000
}

function normalizeDate(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  return todayISO()
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('That file is not a Painting Catalog backup.')
  }
  return value as Record<string, unknown>
}

function typedJpeg(blob: Blob): Blob {
  return blob.type === 'image/jpeg' ? blob : new Blob([blob], { type: 'image/jpeg' })
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read a photo.'))
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type })
}
