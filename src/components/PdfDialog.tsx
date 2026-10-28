import { useState } from 'react'
import { APP_NAME } from '../brand.ts'
import { useCatalog } from '../catalog-context.ts'
import { formatDate, todayISO } from '../format.ts'
import { buildCatalogPdf, type PdfLayout } from '../pdf.ts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.tsx'
import { FileActions } from './FileActions.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'
import { Label } from './ui/label.tsx'
import { cn } from '../lib/utils.ts'

export function PdfDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { paintings, catalogName, saveCatalogName, readPhoto } = useCatalog()
  const [name, setName] = useState(catalogName)
  const [layout, setLayout] = useState<PdfLayout>('single')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [wasOpen, setWasOpen] = useState(open)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setName(catalogName)
      setLayout('single')
      setBusy(false)
      setProgress(null)
      setError(null)
      setBlob(null)
    }
  }

  async function createPdf() {
    setBusy(true)
    setError(null)
    setBlob(null)
    setProgress('Starting…')
    try {
      await saveCatalogName(name)
      const pdf = await buildCatalogPdf({
        catalogName: name,
        paintings,
        layout,
        getPhoto: readPhoto,
        onProgress: setProgress,
      })
      setBlob(pdf)
      setProgress(null)
    } catch (caught) {
      setProgress(null)
      setError(caught instanceof Error ? caught.message : 'Could not create the PDF.')
    } finally {
      setBusy(false)
    }
  }

  const filename = `fred-art-catalog-${layout === 'single' ? 'one-per-page' : 'grid'}-${todayISO()}.pdf`

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export PDF</DialogTitle>
          <DialogDescription>
            Build a catalog on this device, then share it or save the file. Nothing is uploaded.
            {paintings.length === 0
              ? ' The file will be a title page until you add paintings.'
              : ` ${paintings.length === 1 ? '1 painting' : `${paintings.length} paintings`}, ordered by item number.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="catalog-title">Catalog title</Label>
            <Input
              id="catalog-title"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">Layout</legend>
            <LayoutOption
              value="single"
              checked={layout === 'single'}
              title="One painting per page"
              detail="Large photo and every field."
              onSelect={() => setLayout('single')}
            />
            <LayoutOption
              value="grid"
              checked={layout === 'grid'}
              title="Six per page"
              detail="Photo, item number, title, and size."
              onSelect={() => setLayout('grid')}
            />
          </fieldset>
          <Button onClick={() => void createPdf()} disabled={busy}>
            {busy ? 'Creating PDF…' : 'Create PDF'}
          </Button>
          {progress ? (
            <p role="status" className="text-sm text-muted-foreground">
              {progress}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
          {blob ? (
            <FileActions blob={blob} filename={filename} title={`${name || APP_NAME} · ${formatDate(todayISO())}`} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LayoutOption({
  value,
  checked,
  title,
  detail,
  onSelect,
}: {
  value: string
  checked: boolean
  title: string
  detail: string
  onSelect: () => void
}) {
  return (
    <label
      className={cn(
        'flex min-h-16 cursor-pointer gap-3 rounded-xl border p-3',
        checked ? 'border-primary bg-primary/5' : 'border-border bg-card',
      )}
    >
      <input
        type="radio"
        name="pdf-layout"
        value={value}
        checked={checked}
        onChange={onSelect}
        className="mt-1 size-5 accent-[#9a3412]"
      />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
    </label>
  )
}
