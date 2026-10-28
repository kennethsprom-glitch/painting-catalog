import { useEffect, useMemo, useState } from 'react'
import { Archive, FileText } from 'lucide-react'
import { APP_NAME } from '../brand.ts'
import { BackupDialog } from '../components/BackupDialog.tsx'
import { PdfDialog } from '../components/PdfDialog.tsx'
import { Button } from '../components/ui/button.tsx'
import { useCatalog } from '../catalog-context.ts'
import {
  formatSize,
  matchesQuery,
  sortPaintings,
  type SortDir,
  type SortKey,
} from '../format.ts'
import { href } from '../router.ts'
import { requestPersistentStorage } from '../storage.ts'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'itemNumber', label: 'Item #' },
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'location', label: 'Location' },
]

export function GridScreen() {
  const { paintings, thumbs, message, loadSamples, setPersisted } = useCatalog()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState(readSort)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [sampling, setSampling] = useState(false)
  const [sampleError, setSampleError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem('painting-catalog-sort', JSON.stringify(sort))
    } catch {
      /* Preference only. The catalog itself is in IndexedDB. */
    }
  }, [sort])

  const shown = useMemo(
    () => sortPaintings(paintings.filter((painting) => matchesQuery(painting, query)), sort.key, sort.dir),
    [paintings, query, sort],
  )

  const count =
    paintings.length === 0
      ? 'Nothing stored on this device yet'
      : query.trim()
        ? shown.length === 1
          ? '1 match on this device'
          : `${shown.length} matches on this device`
        : paintings.length === 1
          ? '1 painting on this device'
          : `${paintings.length} paintings on this device`

  const directionLabel =
    sort.key === 'itemNumber'
      ? sort.dir === 'asc'
        ? 'Low to high'
        : 'High to low'
      : sort.dir === 'asc'
        ? 'A to Z'
        : 'Z to A'

  return (
    <div className="flex min-h-dvh flex-col">
      <header
        className="bg-[#241c18] text-[#f6f1ea]"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="px-4 pb-4 pt-4">
          <h1 className="font-serif text-[1.7rem] leading-none tracking-tight">{APP_NAME}</h1>
          <p className="mt-2 text-sm text-[#eadfd4]">{count}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              className="border border-[#6d5c54] bg-transparent text-[#f6f1ea] hover:bg-white/10"
              onClick={() => setPdfOpen(true)}
            >
              <FileText />
              Export PDF
            </Button>
            <Button
              className="border border-[#6d5c54] bg-transparent text-[#f6f1ea] hover:bg-white/10"
              onClick={() => {
                void requestPersistentStorage().then(setPersisted)
                setBackupOpen(true)
              }}
            >
              <Archive />
              Backup
            </Button>
          </div>
        </div>
      </header>

      {message ? (
        <p role="status" className="bg-[#efe8de] px-4 py-3 text-sm font-medium">
          {message}
        </p>
      ) : null}

      <div
        className="sticky z-10 border-b border-border bg-background/95 px-4 py-3 backdrop-blur"
        style={{ top: 'env(safe-area-inset-top)' }}
      >
        <label className="sr-only" htmlFor="catalog-search">
          Search catalog
        </label>
        <input
          id="catalog-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search title, artist, location, notes…"
          className="min-h-12 w-full rounded-xl border border-input bg-card px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Sort by">
          {SORTS.map((option) => {
            const selected = sort.key === option.key
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`min-h-11 rounded-full px-3 text-sm font-semibold ${
                  selected ? 'bg-[#241c18] text-[#f6f1ea]' : 'bg-secondary text-foreground'
                }`}
                onClick={() => setSort((current) => ({ ...current, key: option.key }))}
              >
                {option.label}
              </button>
            )
          })}
          <button
            type="button"
            className="min-h-11 rounded-full bg-secondary px-3 text-sm font-semibold"
            aria-label={directionLabel}
            onClick={() =>
              setSort((current) => ({ ...current, dir: current.dir === 'asc' ? 'desc' : 'asc' }))
            }
          >
            {directionLabel}
          </button>
        </div>
      </div>

      <main className="flex-1 pb-4">
        {paintings.length === 0 ? (
          <EmptyState
            sampling={sampling}
            error={sampleError}
            onSamples={() => {
              setSampling(true)
              setSampleError(null)
              void loadSamples()
                .catch((caught: unknown) => {
                  setSampleError(caught instanceof Error ? caught.message : 'Could not add samples.')
                })
                .finally(() => setSampling(false))
            }}
          />
        ) : shown.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <h2 className="font-serif text-2xl">No paintings match “{query.trim()}”</h2>
            <p className="mt-2 text-muted-foreground">Try an item number, a name, or a rack.</p>
            <Button variant="secondary" className="mt-4" onClick={() => setQuery('')}>
              Clear search
            </Button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((painting) => {
              const title = painting.title || 'Untitled'
              const size = formatSize(painting)
              const thumb = painting.photoId ? thumbs.get(painting.photoId) : undefined
              return (
                <li key={painting.id} className="min-w-0">
                  <a
                    href={href({ name: 'detail', id: painting.id })}
                    className="block overflow-hidden rounded-2xl border border-border bg-card shadow-sm active:bg-accent"
                  >
                    <div className="relative aspect-square bg-[#efe8de]">
                      {thumb ? (
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center px-3 text-center text-sm text-muted-foreground">
                          No photo
                        </div>
                      )}
                      <span className="absolute left-2 top-2 rounded-lg bg-[#241c18]/90 px-2 py-1 text-sm font-semibold tabular-nums text-[#f6f1ea]">
                        #{painting.itemNumber}
                      </span>
                    </div>
                    <div className="space-y-1 p-3">
                      <h2 className="line-clamp-2 break-words font-serif text-base leading-snug">{title}</h2>
                      <p className="text-sm text-muted-foreground">{size || 'Size not set'}</p>
                    </div>
                  </a>
                </li>
              )
            })}
          </ul>
        )}
      </main>

      {paintings.length > 0 ? (
        <div
          className="sticky bottom-0 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <Button asChild className="w-full">
            <a href={href({ name: 'new' })}>Add a painting</a>
          </Button>
        </div>
      ) : null}

      <PdfDialog open={pdfOpen} onOpenChange={setPdfOpen} />
      <BackupDialog open={backupOpen} onOpenChange={setBackupOpen} />
    </div>
  )
}

function EmptyState({
  sampling,
  error,
  onSamples,
}: {
  sampling: boolean
  error: string | null
  onSamples: () => void
}) {
  return (
    <div className="mx-auto max-w-sm px-4 py-12 text-center">
      <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-2xl bg-[#efe8de]" aria-hidden="true">
        <svg viewBox="0 0 64 64" className="h-14 w-14">
          <rect x="14" y="10" width="36" height="44" fill="#fffdf9" stroke="#241c18" strokeWidth="2" />
          <rect x="20" y="16" width="24" height="22" fill="#9a3412" />
          <rect x="20" y="42" width="24" height="4" fill="#c47a3a" />
        </svg>
      </div>
      <h2 className="font-serif text-2xl">Nothing in the catalog yet</h2>
      <p className="mt-2 text-muted-foreground">
        Add a painting to give it an item number, a photo, and a place on the rack. It stays on this device.
      </p>
      <Button asChild className="mt-6 w-full">
        <a href={href({ name: 'new' })}>Add a painting</a>
      </Button>
      <Button variant="secondary" className="mt-3 w-full" disabled={sampling} onClick={onSamples}>
        {sampling ? 'Adding samples…' : 'Add 6 sample paintings'}
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function readSort(): { key: SortKey; dir: SortDir } {
  try {
    const raw = localStorage.getItem('painting-catalog-sort')
    if (!raw) return { key: 'itemNumber', dir: 'asc' }
    const parsed = JSON.parse(raw) as { key?: string; dir?: string }
    const key =
      parsed.key === 'title' || parsed.key === 'artist' || parsed.key === 'location' || parsed.key === 'itemNumber'
        ? parsed.key
        : 'itemNumber'
    const dir = parsed.dir === 'desc' ? 'desc' : 'asc'
    return { key, dir }
  } catch {
    return { key: 'itemNumber', dir: 'asc' }
  }
}
