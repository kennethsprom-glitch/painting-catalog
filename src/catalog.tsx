import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { APP_NAME } from './brand.ts'
import { buildJson, buildZip, parseBackup } from './backup.ts'
import {
  deletePainting,
  getCatalogName,
  getPhoto,
  listPaintings,
  mergeCatalog,
  photoByteSize,
  readAllForExport,
  replaceCatalog,
  savePainting,
  setCatalogName,
} from './db.ts'
import { addSamplePaintings } from './samples.ts'
import { requestPersistentStorage } from './storage.ts'
import type { MergeResult, Painting, ParsedBackup, PhotoWrite } from './types.ts'
import { CatalogContext } from './catalog-context.ts'

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paintings, setPaintings] = useState<Painting[]>([])
  const [thumbs, setThumbs] = useState<Map<string, string>>(() => new Map())
  const [catalogName, setName] = useState(APP_NAME)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const urlsRef = useRef<string[]>([])
  const generation = useRef(0)
  const messageTimer = useRef<number | null>(null)
  const sampleLock = useRef(false)

  const notify = useCallback((text: string) => {
    setMessage(text)
    if (messageTimer.current) window.clearTimeout(messageTimer.current)
    messageTimer.current = window.setTimeout(() => setMessage(null), 5000)
  }, [])

  const reload = useCallback(async () => {
    const token = generation.current + 1
    generation.current = token
    const [list, name] = await Promise.all([listPaintings(), getCatalogName()])
    const created: string[] = []
    const next = new Map<string, string>()
    for (const painting of list) {
      if (!painting.photoId) continue
      const photo = await getPhoto(painting.photoId)
      if (!photo) continue
      const url = URL.createObjectURL(photo.thumb)
      created.push(url)
      next.set(painting.photoId, url)
    }
    if (token !== generation.current) {
      created.forEach((url) => URL.revokeObjectURL(url))
      return
    }
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    urlsRef.current = created
    setPaintings(list)
    setThumbs(next)
    setName(name)
  }, [])

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const storage = await requestPersistentStorage()
        if (!cancel) setPersisted(storage)
        await reload()
        if (!cancel) setReady(true)
      } catch (caught) {
        if (!cancel) {
          setError(caught instanceof Error ? caught.message : 'Could not open on-device storage.')
        }
      }
    })()
    return () => {
      cancel = true
    }
  }, [reload])

  useEffect(() => {
    return () => {
      urlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      if (messageTimer.current) window.clearTimeout(messageTimer.current)
    }
  }, [])

  const value = useMemo(
    () => ({
      ready,
      error,
      paintings,
      thumbs,
      catalogName,
      persisted,
      message,
      notify,
      setPersisted,
      async saveCatalogName(name: string) {
        await setCatalogName(name)
        setName(name.trim() || APP_NAME)
      },
      async save(painting: Painting, photo: PhotoWrite) {
        await savePainting(painting, photo)
        await reload()
      },
      async remove(id: string) {
        await deletePainting(id)
        await reload()
      },
      async loadSamples() {
        if (sampleLock.current) return 0
        sampleLock.current = true
        try {
          const count = await addSamplePaintings()
          await reload()
          notify(`Added ${count} sample paintings.`)
          return count
        } finally {
          sampleLock.current = false
        }
      },
      readPhoto(id: string) {
        return getPhoto(id)
      },
      async exportZip() {
        return buildZip(await readAllForExport())
      },
      async exportJson() {
        return buildJson(await readAllForExport())
      },
      async importFile(file: File) {
        return parseBackup(file)
      },
      async replaceAll(data: ParsedBackup) {
        await replaceCatalog(data)
        await reload()
      },
      async mergeAll(data: ParsedBackup): Promise<MergeResult> {
        const result = await mergeCatalog(data)
        await reload()
        return result
      },
      storageBytes: photoByteSize,
    }),
    [catalogName, error, message, notify, paintings, persisted, ready, reload, thumbs],
  )

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}
