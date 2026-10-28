import type { Painting } from './types.ts'

export type SortKey = 'itemNumber' | 'title' | 'artist' | 'location'
export type SortDir = 'asc' | 'desc'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function todayISO(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  const month = MONTHS[Number(match[2]) - 1]
  const day = Number(match[3])
  if (!month || day < 1 || day > 31) return iso
  return `${month} ${day}, ${match[1]}`
}

export function formatInches(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}

export function formatSize(painting: {
  width: number | null
  height: number | null
  depth: number | null
}): string {
  const parts = [painting.width, painting.height, painting.depth].filter(
    (value): value is number => value != null,
  )
  if (parts.length === 0) return ''
  return `${parts.map(formatInches).join(' × ')} in`
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${Math.round(bytes)} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const megabytes = bytes / (1024 * 1024)
  return `${megabytes >= 10 ? Math.round(megabytes) : megabytes.toFixed(1)} MB`
}

export function parseItemNumber(input: string): number | 'invalid' {
  const trimmed = input.trim()
  if (!/^\d{1,6}$/.test(trimmed)) return 'invalid'
  const value = Number(trimmed)
  if (!Number.isInteger(value) || value < 1) return 'invalid'
  return value
}

export function parseInches(input: string): number | null | 'invalid' {
  const trimmed = input.trim()
  if (!trimmed) return null
  if (!/^\d+(\.\d+)?$/.test(trimmed) && !/^\.\d+$/.test(trimmed)) return 'invalid'
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value <= 0 || value > 2000) return 'invalid'
  return Math.round(value * 1000) / 1000
}

export function matchesQuery(painting: Painting, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    String(painting.itemNumber),
    painting.title,
    painting.artist,
    painting.medium,
    painting.location,
    painting.notes,
    formatSize(painting),
    painting.dateAdded,
    formatDate(painting.dateAdded),
  ]
    .join('\n')
    .toLowerCase()
  return haystack.includes(needle)
}

export function sortPaintings(
  list: readonly Painting[],
  key: SortKey,
  dir: SortDir,
): Painting[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    if (key !== 'itemNumber') {
      const left = a[key].trim()
      const right = b[key].trim()
      if (!left && right) return 1
      if (left && !right) return -1
    }
    let result = 0
    if (key === 'itemNumber') {
      result = a.itemNumber - b.itemNumber
    } else {
      result = a[key]
        .trim()
        .localeCompare(b[key].trim(), undefined, { sensitivity: 'base', numeric: true })
      if (result === 0) result = a.itemNumber - b.itemNumber
    }
    return result * sign
  })
}

export function cleanLine(value: string, max: number): string {
  return stripControls(value, false).trim().slice(0, max)
}

export function cleanNotes(value: string, max = 4000): string {
  return stripControls(value, true).trim().slice(0, max)
}

function stripControls(value: string, keepBreaks: boolean): string {
  let out = ''
  for (const char of value) {
    const code = char.charCodeAt(0)
    const isControl = code < 32 || code === 127
    const keep = keepBreaks && (code === 9 || code === 10 || code === 13)
    if (!isControl || keep) out += char
  }
  return out
}

export function isSafeId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,80}$/.test(id)
}
