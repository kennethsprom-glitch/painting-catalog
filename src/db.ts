import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { MergeResult, Painting, PhotoRecord, PhotoWrite } from './types.ts'

const DB_NAME = 'painting-catalog'
const DB_VERSION = 1
const DEFAULT_CATALOG_NAME = 'Painting Catalog'

interface CatalogDB extends DBSchema {
  paintings: {
    key: string
    value: Painting
    indexes: { 'by-item': number }
  }
  photos: {
    key: string
    value: PhotoRecord
  }
  settings: {
    key: string
    value: { key: string; value: string }
  }
}

export class DuplicateItemError extends Error {
  itemNumber: number

  constructor(itemNumber: number) {
    super(`Item ${itemNumber} is already used.`)
    this.name = 'DuplicateItemError'
    this.itemNumber = itemNumber
  }
}

let databasePromise: Promise<IDBPDatabase<CatalogDB>> | null = null

function openCatalog(): Promise<IDBPDatabase<CatalogDB>> {
  if (!databasePromise) {
    databasePromise = openDB<CatalogDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const paintings = database.createObjectStore('paintings', { keyPath: 'id' })
        paintings.createIndex('by-item', 'itemNumber', { unique: true })
        database.createObjectStore('photos', { keyPath: 'id' })
        database.createObjectStore('settings', { keyPath: 'key' })
      },
    }).catch((error: unknown) => {
      databasePromise = null
      throw error
    })
  }
  return databasePromise
}

export async function listPaintings(): Promise<Painting[]> {
  const database = await openCatalog()
  return database.getAll('paintings')
}

export async function getPainting(id: string): Promise<Painting | undefined> {
  const database = await openCatalog()
  return database.get('paintings', id)
}

export async function getPhoto(id: string): Promise<PhotoRecord | undefined> {
  const database = await openCatalog()
  return database.get('photos', id)
}

export async function nextItemNumber(): Promise<number> {
  const paintings = await listPaintings()
  return paintings.reduce((max, painting) => Math.max(max, painting.itemNumber), 0) + 1
}

export async function getCatalogName(): Promise<string> {
  const database = await openCatalog()
  const row = await database.get('settings', 'catalogName')
  const name = row?.value.trim()
  return name || DEFAULT_CATALOG_NAME
}

export async function setCatalogName(name: string): Promise<void> {
  const database = await openCatalog()
  const trimmed = name.trim() || DEFAULT_CATALOG_NAME
  await database.put('settings', { key: 'catalogName', value: trimmed })
}

export async function photoByteSize(): Promise<number> {
  const database = await openCatalog()
  const photos = await database.getAll('photos')
  return photos.reduce((total, photo) => total + photo.full.size + photo.thumb.size, 0)
}

export async function readAllForExport(): Promise<{
  catalogName: string
  paintings: Painting[]
  photos: PhotoRecord[]
}> {
  const database = await openCatalog()
  const [paintings, photos, catalogName] = await Promise.all([
    database.getAll('paintings'),
    database.getAll('photos'),
    getCatalogName(),
  ])
  return { catalogName, paintings, photos }
}

export async function savePainting(painting: Painting, photo: PhotoWrite): Promise<void> {
  const database = await openCatalog()
  const tx = database.transaction(['paintings', 'photos'], 'readwrite')
  const paintings = tx.objectStore('paintings')
  const photos = tx.objectStore('photos')
  const conflict = await paintings.index('by-item').get(painting.itemNumber)
  if (conflict && conflict.id !== painting.id) {
    tx.abort()
    try {
      await tx.done
    } catch {
      /* The abort is the point: item numbers stay unique. */
    }
    throw new DuplicateItemError(painting.itemNumber)
  }
  const previous = await paintings.get(painting.id)
  let next = painting
  if (photo.kind === 'set') next = { ...painting, photoId: photo.photo.id }
  if (photo.kind === 'remove') next = { ...painting, photoId: null }
  await paintings.put(next)
  if (photo.kind === 'set') {
    await photos.put(photo.photo)
    if (previous?.photoId && previous.photoId !== photo.photo.id) {
      await photos.delete(previous.photoId)
    }
  } else if (photo.kind === 'remove' && previous?.photoId) {
    await photos.delete(previous.photoId)
  }
  try {
    await tx.done
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') {
      throw new DuplicateItemError(painting.itemNumber)
    }
    throw error
  }
}

export async function deletePainting(id: string): Promise<void> {
  const database = await openCatalog()
  const tx = database.transaction(['paintings', 'photos'], 'readwrite')
  const painting = await tx.objectStore('paintings').get(id)
  await tx.objectStore('paintings').delete(id)
  if (painting?.photoId) await tx.objectStore('photos').delete(painting.photoId)
  await tx.done
}

export async function replaceCatalog(data: {
  catalogName: string
  paintings: Painting[]
  photos: PhotoRecord[]
}): Promise<void> {
  const database = await openCatalog()
  const tx = database.transaction(['paintings', 'photos', 'settings'], 'readwrite')
  await tx.objectStore('paintings').clear()
  await tx.objectStore('photos').clear()
  for (const painting of data.paintings) await tx.objectStore('paintings').put(painting)
  for (const photo of data.photos) await tx.objectStore('photos').put(photo)
  await tx.objectStore('settings').put({
    key: 'catalogName',
    value: data.catalogName.trim() || DEFAULT_CATALOG_NAME,
  })
  await tx.done
}

export async function mergeCatalog(data: {
  paintings: Painting[]
  photos: PhotoRecord[]
}): Promise<MergeResult> {
  const database = await openCatalog()
  const tx = database.transaction(['paintings', 'photos'], 'readwrite')
  const paintings = tx.objectStore('paintings')
  const photos = tx.objectStore('photos')
  const existing = await paintings.getAll()
  const byId = new Map(existing.map((painting) => [painting.id, painting]))
  const used = new Set(existing.map((painting) => painting.itemNumber))
  let nextNumber = existing.reduce((max, painting) => Math.max(max, painting.itemNumber), 0) + 1
  let added = 0
  let updated = 0
  let renumbered = 0

  const takeFreeNumber = () => {
    while (used.has(nextNumber)) nextNumber += 1
    const value = nextNumber
    nextNumber += 1
    renumbered += 1
    return value
  }

  for (const incoming of data.paintings) {
    const previous = byId.get(incoming.id)
    let itemNumber = incoming.itemNumber
    if (previous) {
      if (previous.itemNumber !== itemNumber) used.delete(previous.itemNumber)
      if (previous.itemNumber !== itemNumber && used.has(itemNumber)) itemNumber = takeFreeNumber()
      if (previous.photoId && previous.photoId !== incoming.photoId) {
        await photos.delete(previous.photoId)
      }
      updated += 1
    } else {
      if (used.has(itemNumber)) itemNumber = takeFreeNumber()
      added += 1
    }
    used.add(itemNumber)
    await paintings.put({ ...incoming, itemNumber })
  }

  for (const photo of data.photos) await photos.put(photo)
  await tx.done
  return { added, updated, renumbered }
}
