import { useState } from 'react'
import { formatBytes } from '../format.ts'
import { canTryShare, downloadBlob, shareFile } from '../share.ts'
import { Button } from './ui/button.tsx'

export function FileActions({
  blob,
  filename,
  title,
}: {
  blob: Blob
  filename: string
  title: string
}) {
  const [note, setNote] = useState<string | null>(null)
  const shareable = canTryShare()

  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">Ready · {formatBytes(blob.size)}</p>
      {shareable ? (
        <Button
          onClick={() => {
            void shareFile(blob, filename, title).then((result) => {
              if (result === 'unavailable' || result === 'failed') {
                setNote('Sharing is not available here. Save the file instead.')
              } else {
                setNote(null)
              }
            })
          }}
        >
          Share…
        </Button>
      ) : null}
      <Button variant={shareable ? 'secondary' : 'default'} onClick={() => downloadBlob(blob, filename)}>
        Save file
      </Button>
      {note ? (
        <p role="status" className="text-sm text-muted-foreground">
          {note}
        </p>
      ) : null}
    </div>
  )
}
