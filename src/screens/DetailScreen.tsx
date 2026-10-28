import { useEffect, useState } from 'react'
import { useCatalog } from '../catalog-context.ts'
import { Button } from '../components/ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog.tsx'
import { getPhoto } from '../db.ts'
import { formatDate, formatSize } from '../format.ts'
import { go, href } from '../router.ts'

export function DetailScreen({ id }: { id: string }) {
  const { ready, paintings, thumbs, remove, notify } = useCatalog()
  const painting = paintings.find((entry) => entry.id === id)
  const [full, setFull] = useState<{ id: string; url: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const photoId = painting?.photoId
    if (!photoId) return
    let cancel = false
    let created: string | null = null
    void getPhoto(photoId).then((photo) => {
      if (!photo || cancel) return
      created = URL.createObjectURL(photo.full)
      if (cancel) {
        URL.revokeObjectURL(created)
        return
      }
      setFull({ id: photoId, url: created })
    })
    return () => {
      cancel = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [painting?.photoId])

  if (!ready) return <p className="px-4 py-10 text-center">Opening the catalog…</p>
  if (!painting) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-serif text-2xl">That painting isn’t on this device</h1>
        <Button asChild className="mt-6">
          <a href={href({ name: 'grid' })}>Back to catalog</a>
        </Button>
      </div>
    )
  }

  const title = painting.title || 'Untitled'
  const thumb = painting.photoId ? thumbs.get(painting.photoId) : undefined
  const photo = full && full.id === painting.photoId ? full.url : (thumb ?? null)
  const rows: Array<[string, string]> = [
    ['Dimensions', formatSize(painting) || 'Not set'],
    ['Medium', painting.medium || 'Not set'],
    ['Storage location', painting.location || 'Not set'],
    ['Date added', formatDate(painting.dateAdded)],
  ]

  return (
    <article className="mx-auto min-h-dvh w-full max-w-xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header
        className="flex items-center justify-between px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <a href={href({ name: 'grid' })} className="inline-flex min-h-11 items-center text-base font-semibold text-primary">
          Back
        </a>
      </header>
      {photo ? (
        <img
          src={photo}
          alt={`Photo of ${title}`}
          className="max-h-[70dvh] w-full bg-[#efe8de] object-contain"
        />
      ) : (
        <div className="flex h-56 items-center justify-center bg-[#efe8de] text-muted-foreground">No photo</div>
      )}
      <div className="grid gap-4 px-4 py-5">
        <div>
          <p className="text-sm font-semibold tracking-wide text-primary">No. {painting.itemNumber}</p>
          <h1 className="mt-1 font-serif text-3xl leading-tight">{title}</h1>
          <p className="mt-1 text-lg text-muted-foreground">{painting.artist || 'Artist not set'}</p>
        </div>
        <dl className="grid gap-3">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[8.5rem_1fr] gap-3 border-t border-border pt-3">
              <dt className="text-sm font-semibold text-primary">{label}</dt>
              <dd className="text-base">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-border pt-3">
          <h2 className="text-sm font-semibold text-primary">Notes</h2>
          <p className="mt-1 whitespace-pre-wrap text-base">{painting.notes || 'Not set'}</p>
        </div>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="secondary">
            <a href={href({ name: 'edit', id: painting.id })}>Edit</a>
          </Button>
          <Button variant="destructive" onClick={() => setConfirm(true)}>
            Delete
          </Button>
        </div>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this painting?</DialogTitle>
            <DialogDescription>
              Item {painting.itemNumber}, “{title}”, and its photo will be removed from this device.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => {
                setDeleting(true)
                void remove(painting.id)
                  .then(() => {
                    notify(`Deleted item ${painting.itemNumber}.`)
                    go({ name: 'grid' })
                  })
                  .catch((caught: unknown) => {
                    setDeleting(false)
                    setConfirm(false)
                    setError(caught instanceof Error ? caught.message : 'Could not delete that painting.')
                  })
              }}
            >
              Delete painting
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}
