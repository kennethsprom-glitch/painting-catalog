export type Painting = {
  id: string
  itemNumber: number
  title: string
  artist: string
  width: number | null
  height: number | null
  depth: number | null
  medium: string
  location: string
  notes: string
  dateAdded: string
  photoId: string | null
}

export type PhotoRecord = {
  id: string
  full: Blob
  thumb: Blob
}

export type PhotoWrite =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'set'; photo: PhotoRecord }

export type ParsedBackup = {
  catalogName: string
  exportedAt: string | null
  paintings: Painting[]
  photos: PhotoRecord[]
  missingPhotos: number
}

export type MergeResult = {
  added: number
  updated: number
  renumbered: number
}
