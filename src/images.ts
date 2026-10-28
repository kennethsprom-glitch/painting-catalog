const FULL_EDGE = 2000
const THUMB_EDGE = 480

export async function photoFromFile(file: Blob): Promise<{ full: Blob; thumb: Blob }> {
  const bitmap = await decodeBitmap(file)
  try {
    const full = await renderJpeg(bitmap, FULL_EDGE, 0.82)
    const thumb = await renderJpeg(bitmap, THUMB_EDGE, 0.72)
    return { full, thumb }
  } finally {
    bitmap.close()
  }
}

export async function thumbFromBlob(blob: Blob): Promise<Blob> {
  const bitmap = await decodeBitmap(blob)
  try {
    return await renderJpeg(bitmap, THUMB_EDGE, 0.72)
  } finally {
    bitmap.close()
  }
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not create a JPEG.'))),
      'image/jpeg',
      quality,
    )
  })
}

export async function thumbFromCanvas(source: HTMLCanvasElement): Promise<Blob> {
  const scale = Math.min(1, THUMB_EDGE / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare that photo.')
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvasToJpeg(canvas, 0.72)
}

async function decodeBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.decoding = 'async'
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () =>
          reject(new Error('Could not read that photo. Use a JPEG or PNG, or take a new picture.'))
        image.src = url
      })
      return await createImageBitmap(image)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

async function renderJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare that photo.')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(bitmap, 0, 0, width, height)
  return canvasToJpeg(canvas, quality)
}
