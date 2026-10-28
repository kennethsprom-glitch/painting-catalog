import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Camera, ImagePlus } from 'lucide-react'
import { useCatalog } from '../catalog-context.ts'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Label } from '../components/ui/label.tsx'
import { Textarea } from '../components/ui/textarea.tsx'
import { DuplicateItemError, getPainting, getPhoto, nextItemNumber } from '../db.ts'
import {
  cleanLine,
  cleanNotes,
  parseInches,
  parseItemNumber,
  todayISO,
} from '../format.ts'
import { photoFromFile } from '../images.ts'
import { go, href } from '../router.ts'
import type { Painting, PhotoWrite } from '../types.ts'

type DraftPhoto = { id: string; full: Blob; thumb: Blob; url: string }

export function FormScreen({ mode, id }: { mode: 'new' | 'edit'; id?: string }) {
  const { save } = useCatalog()
  const [ready, setReady] = useState(false)
  const [missing, setMissing] = useState(false)
  const [itemNumber, setItemNumber] = useState('')
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [depth, setDepth] = useState('')
  const [medium, setMedium] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [dateAdded, setDateAdded] = useState(todayISO)
  const [draft, setDraft] = useState<DraftPhoto | null>(null)
  const [existingUrl, setExistingUrl] = useState<string | null>(null)
  const [existingPhotoId, setExistingPhotoId] = useState<string | null>(null)
  const [cleared, setCleared] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const draftRef = useRef<DraftPhoto | null>(null)
  const existingRef = useRef<string | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancel = false
    void (async () => {
      if (mode === 'new') {
        const next = await nextItemNumber()
        if (cancel) return
        setItemNumber(String(next))
        setDateAdded(todayISO())
        setReady(true)
        return
      }
      if (!id) {
        setMissing(true)
        setReady(true)
        return
      }
      const painting = await getPainting(id)
      if (cancel) return
      if (!painting) {
        setMissing(true)
        setReady(true)
        return
      }
      setItemNumber(String(painting.itemNumber))
      setTitle(painting.title)
      setArtist(painting.artist)
      setWidth(painting.width == null ? '' : String(painting.width))
      setHeight(painting.height == null ? '' : String(painting.height))
      setDepth(painting.depth == null ? '' : String(painting.depth))
      setMedium(painting.medium)
      setLocation(painting.location)
      setNotes(painting.notes)
      setDateAdded(painting.dateAdded)
      setExistingPhotoId(painting.photoId)
      if (painting.photoId) {
        const photo = await getPhoto(painting.photoId)
        if (photo && !cancel) {
          const url = URL.createObjectURL(photo.full)
          existingRef.current = url
          setExistingUrl(url)
        }
      }
      if (!cancel) setReady(true)
    })()
    return () => {
      cancel = true
    }
  }, [id, mode])

  useEffect(() => {
    return () => {
      if (draftRef.current) URL.revokeObjectURL(draftRef.current.url)
      if (existingRef.current) URL.revokeObjectURL(existingRef.current)
    }
  }, [])

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > 40 * 1024 * 1024) {
      setPhotoError('That photo is over 40 MB. Choose a smaller one.')
      return
    }
    setPhotoError(null)
    setPreparing(true)
    try {
      const { full, thumb } = await photoFromFile(file)
      const url = URL.createObjectURL(full)
      const next = { id: crypto.randomUUID(), full, thumb, url }
      if (draftRef.current) URL.revokeObjectURL(draftRef.current.url)
      draftRef.current = next
      setDraft(next)
      setCleared(false)
    } catch (caught) {
      setPhotoError(caught instanceof Error ? caught.message : 'Could not read that photo.')
    } finally {
      setPreparing(false)
    }
  }

  function clearPhoto() {
    if (draftRef.current) URL.revokeObjectURL(draftRef.current.url)
    draftRef.current = null
    setDraft(null)
    setCleared(true)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (preparing || saving) return
    const nextErrors: Record<string, string> = {}
    const number = parseItemNumber(itemNumber)
    if (number === 'invalid') nextErrors.itemNumber = 'Use a whole number, 1 or greater.'
    const titleClean = cleanLine(title, 200)
    if (!titleClean) nextErrors.title = 'Add a title. Untitled is fine.'
    const widthValue = parseInches(width)
    const heightValue = parseInches(height)
    const depthValue = parseInches(depth)
    if (widthValue === 'invalid') nextErrors.width = 'Enter width in inches, like 24 or 24.5.'
    if (heightValue === 'invalid') nextErrors.height = 'Enter height in inches, like 30 or 30.25.'
    if (depthValue === 'invalid') nextErrors.depth = 'Enter depth in inches, or leave it blank.'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateAdded)) nextErrors.dateAdded = 'Choose a date.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0 || number === 'invalid') return
    if (widthValue === 'invalid' || heightValue === 'invalid' || depthValue === 'invalid') return

    const paintingId = mode === 'edit' && id ? id : crypto.randomUUID()
    const photoId = draft ? draft.id : cleared ? null : existingPhotoId
    const painting: Painting = {
      id: paintingId,
      itemNumber: number,
      title: titleClean,
      artist: cleanLine(artist, 200),
      width: widthValue,
      height: heightValue,
      depth: depthValue,
      medium: cleanLine(medium, 200),
      location: cleanLine(location, 200),
      notes: cleanNotes(notes),
      dateAdded,
      photoId,
    }
    const photo: PhotoWrite = draft
      ? { kind: 'set', photo: { id: draft.id, full: draft.full, thumb: draft.thumb } }
      : cleared
        ? { kind: 'remove' }
        : { kind: 'keep' }

    setSaving(true)
    try {
      await save(painting, photo)
      go({ name: 'detail', id: paintingId })
    } catch (caught) {
      setSaving(false)
      if (caught instanceof DuplicateItemError) {
        setErrors({ itemNumber: caught.message })
        return
      }
      setErrors({
        form: caught instanceof Error ? caught.message : 'Could not save that painting.',
      })
    }
  }

  if (!ready) return <p className="px-4 py-10 text-center">Opening the catalog…</p>
  if (missing) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-serif text-2xl">That painting isn’t on this device</h1>
        <Button asChild className="mt-6">
          <a href={href({ name: 'grid' })}>Back to catalog</a>
        </Button>
      </div>
    )
  }

  const preview = draft?.url ?? (!cleared ? existingUrl : null)
  const back = mode === 'edit' && id ? href({ name: 'detail', id }) : href({ name: 'grid' })

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="mx-auto min-h-dvh w-full max-w-xl">
      <header
        className="flex items-center justify-between gap-3 px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <a href={back} className="inline-flex min-h-11 items-center text-base font-semibold text-primary">
          Cancel
        </a>
        <h1 className="font-serif text-xl">{mode === 'new' ? 'New painting' : 'Edit painting'}</h1>
        <span className="w-16" aria-hidden="true" />
      </header>
      <div className="grid gap-5 px-4 pb-4">
        <div className="grid gap-3">
          <div className="overflow-hidden rounded-2xl bg-[#efe8de]">
            {preview ? (
              <img src={preview} alt="Photo ready to save" className="max-h-80 w-full object-contain" />
            ) : (
              <div className="flex h-48 items-center justify-center px-6 text-center text-muted-foreground">
                Take a photo or choose one from your library.
              </div>
            )}
          </div>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Take photo"
            className="sr-only"
            onChange={(event) => void onFile(event)}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            aria-label="Photo library"
            className="sr-only"
            onChange={(event) => void onFile(event)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => cameraRef.current?.click()}>
              <Camera />
              Take photo
            </Button>
            <Button variant="secondary" onClick={() => libraryRef.current?.click()}>
              <ImagePlus />
              Photo library
            </Button>
          </div>
          {preview ? (
            <Button variant="secondary" onClick={clearPhoto}>
              Remove photo
            </Button>
          ) : null}
          {preparing ? (
            <p role="status" className="text-sm text-muted-foreground">
              Preparing photo…
            </p>
          ) : null}
          {draft ? (
            <p className="text-sm text-muted-foreground">
              Stored as a JPEG with the long side at most 2000 pixels.
            </p>
          ) : null}
          {photoError ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {photoError}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="item-number">Item number</Label>
          <Input
            id="item-number"
            inputMode="numeric"
            autoComplete="off"
            value={itemNumber}
            aria-invalid={Boolean(errors.itemNumber)}
            aria-describedby="item-help"
            onChange={(event) => setItemNumber(event.target.value)}
          />
          <p id="item-help" className="text-sm text-muted-foreground">
            Given automatically. Change it if this painting already has a number. It has to stay unique.
          </p>
          {errors.itemNumber ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errors.itemNumber}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            maxLength={200}
            required
            aria-invalid={Boolean(errors.title)}
            onChange={(event) => setTitle(event.target.value)}
          />
          {errors.title ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errors.title}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="artist">Artist</Label>
          <Input id="artist" value={artist} maxLength={200} onChange={(event) => setArtist(event.target.value)} />
        </div>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-semibold">Dimensions in inches</legend>
          <p className="text-sm text-muted-foreground">Decimals are fine. Depth is optional.</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="grid gap-2">
              <Label htmlFor="width">Width</Label>
              <Input
                id="width"
                inputMode="decimal"
                value={width}
                aria-invalid={Boolean(errors.width)}
                onChange={(event) => setWidth(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="height">Height</Label>
              <Input
                id="height"
                inputMode="decimal"
                value={height}
                aria-invalid={Boolean(errors.height)}
                onChange={(event) => setHeight(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="depth">Depth</Label>
              <Input
                id="depth"
                inputMode="decimal"
                value={depth}
                aria-invalid={Boolean(errors.depth)}
                onChange={(event) => setDepth(event.target.value)}
              />
            </div>
          </div>
          {errors.width || errors.height || errors.depth ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errors.width || errors.height || errors.depth}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-2">
          <Label htmlFor="medium">Medium</Label>
          <Input id="medium" value={medium} maxLength={200} onChange={(event) => setMedium(event.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="location">Storage location</Label>
          <Input
            id="location"
            value={location}
            maxLength={200}
            placeholder="Rack, drawer, bin"
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="date-added">Date added</Label>
          <Input
            id="date-added"
            type="date"
            value={dateAdded}
            aria-invalid={Boolean(errors.dateAdded)}
            onChange={(event) => setDateAdded(event.target.value)}
          />
          {errors.dateAdded ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {errors.dateAdded}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={notes}
            maxLength={4000}
            rows={5}
            placeholder="Condition, frame, wrapping, anything you want in the PDF."
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        {errors.form ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {errors.form}
          </p>
        ) : null}
      </div>
      <div
        className="sticky bottom-0 border-t border-border bg-background/95 px-4 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <Button type="submit" className="w-full" disabled={saving || preparing}>
          {saving ? 'Saving…' : 'Save painting'}
        </Button>
      </div>
    </form>
  )
}
