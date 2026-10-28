import { createContext, useContext } from 'react'
import type { MergeResult, Painting, ParsedBackup, PhotoRecord, PhotoWrite } from './types.ts'

export type CatalogValue = {
  ready: boolean
  error: string | null
  paintings: Painting[]
  thumbs: ReadonlyMap<string, string>
  catalogName: string
  persisted: boolean | null
  message: string | null
  notify: (text: string) => void
  setPersisted: (value: boolean | null) => void
  saveCatalogName: (name: string) => Promise<void>
  save: (painting: Painting, photo: PhotoWrite) => Promise<void>
  remove: (id: string) => Promise<void>
  loadSamples: () => Promise<number>
  readPhoto: (id: string) => Promise<PhotoRecord | undefined>
  exportZip: () => Promise<Blob>
  exportJson: () => Promise<Blob>
  importFile: (file: File) => Promise<ParsedBackup>
  replaceAll: (data: ParsedBackup) => Promise<void>
  mergeAll: (data: ParsedBackup) => Promise<MergeResult>
  storageBytes: () => Promise<number>
}

export const CatalogContext = createContext<CatalogValue | null>(null)

export function useCatalog(): CatalogValue {
  const value = useContext(CatalogContext)
  if (!value) throw new Error('useCatalog must be used within CatalogProvider')
  return value
}
