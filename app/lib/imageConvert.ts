export interface ConvertResult {
  blob: Blob
  note?: string
}

function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name)
  return m ? m[1].toLowerCase() : ''
}

// Camera RAW containers — all TIFF-based, all carrying an embedded
// full-size or near-full-size JPEG preview we can pull out. True RAW
// demosaicing needs desktop-class software, so this is a best-effort path.
const RAW_EXTS = new Set([
  'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'raf', 'rw2', 'pef', 'srw', 'raw', 'x3f', 'erf', 'kdc', 'mrw', '3fr',
])

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', quality)
  )
}

async function bitmapToCanvas(bitmap: ImageBitmap): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  // Flatten onto white first — source formats with transparency (PNG, GIF,
  // WEBP, SVG) would otherwise composite onto a black JPEG background.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas
}

/**
 * Convert an image file of almost any kind to a JPEG. PNG/GIF/WEBP/BMP/JPG/
 * SVG/AVIF go through the browser's own decoder; TIFF, PSD, HEIC/HEIF, and
 * RAW camera formats route through a dedicated decoder that's dynamically
 * imported so converting a PNG never pays for the others' code.
 */
export async function convertImageToJpeg(file: File, quality = 0.92): Promise<ConvertResult> {
  const e = extOf(file.name)
  const type = file.type

  if (type === 'image/tiff' || e === 'tif' || e === 'tiff') return convertTiff(file, quality)
  if (type === 'image/vnd.adobe.photoshop' || e === 'psd') return convertPsd(file, quality)

  if (type === 'image/heic' || type === 'image/heif' || e === 'heic' || e === 'heif') {
    // Safari can decode HEIC natively via createImageBitmap — try that
    // first and only pull in the WASM decoder if it fails.
    try {
      return await convertNative(file, quality)
    } catch {
      return convertHeic(file, quality)
    }
  }

  if (RAW_EXTS.has(e)) return convertRaw(file, quality)

  return convertNative(file, quality)
}

async function convertNative(file: File, quality: number): Promise<ConvertResult> {
  // Chromium's createImageBitmap refuses to decode SVG at all — go straight
  // to the <img>-element path, which every browser supports for SVG.
  if (file.type === 'image/svg+xml' || extOf(file.name) === 'svg') {
    return convertViaImageElement(file, quality)
  }
  try {
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      bitmap = await createImageBitmap(file)
    }
    const canvas = await bitmapToCanvas(bitmap)
    return { blob: await canvasToJpeg(canvas, quality) }
  } catch {
    // Fallback for any other format createImageBitmap won't take directly.
    return convertViaImageElement(file, quality)
  }
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('The source image could not be decoded.'))
    img.src = url
  })
}

async function convertViaImageElement(file: File, quality: number): Promise<ConvertResult> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImageElement(url)
    // SVGs with no intrinsic width/height (e.g. viewBox-only) report 0 —
    // fall back to an A4-ish canvas so the export still produces an image.
    const width = img.naturalWidth || img.width || 1240
    const height = img.naturalHeight || img.height || 1754
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    return { blob: await canvasToJpeg(canvas, quality) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function convertTiff(file: File, quality: number): Promise<ConvertResult> {
  const UTIF = await import('utif')
  const buffer = await file.arrayBuffer()
  const ifds = UTIF.decode(buffer)
  if (ifds.length === 0) throw new Error('Not a readable TIFF file.')

  // Multi-page TIFFs (scanners, some RAW previews): pick the largest page
  // by its raw ImageWidth/ImageLength tags — .width/.height only exist
  // after decodeImage() has run on that specific page.
  let page = ifds[0]
  let bestArea = (page.t256?.[0] ?? 0) * (page.t257?.[0] ?? 0)
  for (const ifd of ifds) {
    const area = (ifd.t256?.[0] ?? 0) * (ifd.t257?.[0] ?? 0)
    if (area > bestArea) {
      page = ifd
      bestArea = area
    }
  }

  UTIF.decodeImage(buffer, page, ifds)
  const rgba = UTIF.toRGBA8(page)
  const width = page.width!
  const height = page.height!
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const imgData = ctx.createImageData(width, height)
  imgData.data.set(rgba)
  ctx.putImageData(imgData, 0, 0)
  return { blob: await canvasToJpeg(canvas, quality) }
}

async function convertPsd(file: File, quality: number): Promise<ConvertResult> {
  const { readPsd } = await import('ag-psd')
  const buffer = await file.arrayBuffer()
  const psd = readPsd(buffer, { skipLayerImageData: true })
  const canvas = psd.canvas
  if (!canvas) throw new Error('This PSD has no flattened preview to convert.')
  return { blob: await canvasToJpeg(canvas, quality), note: 'Flattened composite — layers not preserved.' }
}

async function convertHeic(file: File, quality: number): Promise<ConvertResult> {
  const heic2any = (await import('heic2any')).default
  const result = await heic2any({ blob: file, toType: 'image/jpeg', quality })
  return { blob: Array.isArray(result) ? result[0] : result }
}

async function convertRaw(file: File, quality: number): Promise<ConvertResult> {
  const exifr = await import('exifr')
  const thumb = await exifr.thumbnail(file)
  if (!thumb) throw new Error('No embedded preview found in this RAW file — full RAW processing needs desktop software.')
  const blob = new Blob([new Uint8Array(thumb)], { type: 'image/jpeg' })
  const bitmap = await createImageBitmap(blob)
  const canvas = await bitmapToCanvas(bitmap)
  return { blob: await canvasToJpeg(canvas, quality), note: 'Extracted embedded preview — not a full RAW develop.' }
}
