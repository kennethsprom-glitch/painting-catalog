export async function shareFile(
  blob: Blob,
  filename: string,
  title: string,
): Promise<'shared' | 'cancelled' | 'unavailable' | 'failed'> {
  if (typeof navigator.share !== 'function') return 'unavailable'
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
  if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
    return 'unavailable'
  }
  try {
    await navigator.share({ files: [file], title })
    return 'shared'
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
    return 'failed'
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function canTryShare(): boolean {
  return typeof navigator.share === 'function'
}
