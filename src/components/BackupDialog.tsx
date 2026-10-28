import { useEffect, useState, type ChangeEvent } from 'react'
import { useCatalog } from '../catalog-context.ts'
import { photoByteSize } from '../db.ts'
import { formatBytes, todayISO } from '../format.ts'
import { requestPersistentStorage } from '../storage.ts'
import type { ParsedBackup } from '../types.ts'
import { FileActions } from './FileActions.tsx'
import { Button } from './ui/button.tsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.tsx'

export function BackupDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const {
    paintings,
    persisted,
    setPersisted,
    notify,
    exportZip,
    exportJson,
    importFile,
    replaceAll,
    mergeAll,
    loadSamples,
  } = useCatalog()
  const [bytes, setBytes] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [zipBlob, setZipBlob] = useState<Blob | null>(null)
  const [jsonBlob, setJsonBlob] = useState<Blob | null>(null)
  const [sampleNote, setSampleNote] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(open)

  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setError(null)
      setConfirmReplace(false)
      setZipBlob(null)
      setJsonBlob(null)
      setSampleNote(null)
      setFile(null)
    }
  }

  useEffect(() => {
    if (!open) return
    let cancel = false
    void photoByteSize().then((value) => {
      if (!cancel) setBytes(value)
    })
    return () => {
      cancel = true
    }
  }, [open])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong with the backup.')
    } finally {
      setBusy(false)
      setBytes(await photoByteSize().catch(() => bytes ?? 0))
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null
    event.target.value = ''
    setFile(picked)
    setConfirmReplace(false)
    setError(null)
  }

  async function finishImport(kind: 'replace' | 'merge', data: ParsedBackup) {
    const missing =
      data.missingPhotos > 0
        ? ` ${data.missingPhotos} ${data.missingPhotos === 1 ? 'photo was' : 'photos were'} missing.`
        : ''
    if (kind === 'replace') {
      await replaceAll(data)
      notify(`Restored ${data.paintings.length} ${data.paintings.length === 1 ? 'painting' : 'paintings'}.${missing}`)
    } else {
      const result = await mergeAll(data)
      const renumbered =
        result.renumbered > 0
          ? ` ${result.renumbered} item ${result.renumbered === 1 ? 'number was' : 'numbers were'} renumbered.`
          : ''
      notify(`Added ${result.added}, updated ${result.updated}.${renumbered}${missing}`)
    }
    onOpenChange(false)
  }

  const stamp = todayISO()

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Backup</DialogTitle>
          <DialogDescription>
            Export every painting and photo so a copy exists outside this browser. Import it if Safari
            clears storage. A Home Screen icon keeps its own storage, separate from a Safari tab.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6">
          <section className="grid gap-2">
            <h2 className="font-serif text-lg">Save a copy</h2>
            <p className="text-sm text-muted-foreground">
              {paintings.length === 1 ? '1 painting' : `${paintings.length} paintings`}
              {bytes == null ? '' : ` · ${formatBytes(bytes)} of photos`}. Zip is the file to keep. JSON
              is a single file with the photos inside it.
            </p>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setZipBlob(await exportZip())
                  setJsonBlob(null)
                })
              }
            >
              Create .zip backup
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  setJsonBlob(await exportJson())
                  setZipBlob(null)
                })
              }
            >
              Create .json backup
            </Button>
            {zipBlob ? (
              <FileActions
                blob={zipBlob}
                filename={`painting-catalog-backup-${stamp}.zip`}
                title="Painting Catalog backup"
              />
            ) : null}
            {jsonBlob ? (
              <FileActions
                blob={jsonBlob}
                filename={`painting-catalog-backup-${stamp}.json`}
                title="Painting Catalog backup"
              />
            ) : null}
          </section>

          <section className="grid gap-2">
            <h2 className="font-serif text-lg">Bring a copy back</h2>
            <input
              id="backup-file"
              aria-label="Backup file"
              type="file"
              accept=".zip,.json,application/zip,application/json"
              className="sr-only"
              onChange={onPick}
            />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => document.getElementById('backup-file')?.click()}
            >
              Choose backup file
            </Button>
            {file ? <p className="text-sm text-muted-foreground">{file.name}</p> : null}
            {file && !confirmReplace ? (
              <div className="grid gap-2">
                <Button disabled={busy} onClick={() => setConfirmReplace(true)}>
                  Replace catalog
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (!file) return
                      await finishImport('merge', await importFile(file))
                    })
                  }
                >
                  Merge into catalog
                </Button>
              </div>
            ) : null}
            {file && confirmReplace ? (
              <div className="grid gap-3 rounded-xl border border-destructive/40 bg-card p-3">
                <p className="text-sm">
                  Replace everything on this device with {file.name}? Paintings that are not in the file
                  will be deleted.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" disabled={busy} onClick={() => setConfirmReplace(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        if (!file) return
                        await finishImport('replace', await importFile(file))
                      })
                    }
                  >
                    Replace everything
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="grid gap-2">
            <h2 className="font-serif text-lg">Storage</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {persisted === true
                ? 'This browser agreed to keep the catalog when space gets tight.'
                : persisted === false
                  ? 'This browser has not promised to keep the catalog. Export a backup before you need it.'
                  : 'Persistent storage is not available in this browser. Export a backup.'}
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void requestPersistentStorage().then((value) => {
                  setPersisted(value)
                })
              }
            >
              Ask to keep storage
            </Button>
          </section>

          <section className="grid gap-2">
            <h2 className="font-serif text-lg">Samples</h2>
            <p className="text-sm text-muted-foreground">
              Six fictional paintings with generated pictures, so you can try the catalog. They are not
              real works.
            </p>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const count = await loadSamples()
                  if (count > 0) setSampleNote(`Added ${count} sample paintings.`)
                })
              }
            >
              Add 6 sample paintings
            </Button>
            {sampleNote ? (
              <p role="status" className="text-sm font-medium">
                {sampleNote}
              </p>
            ) : null}
          </section>

          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
