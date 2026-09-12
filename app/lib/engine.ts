import { PDFDocument, PageSizes, StandardFonts, degrees, rgb, PDFName, PDFNumber, PDFRawStream, PDFFont, PDFImage, PDFPage } from 'pdf-lib'

/** Load a PDFDocument from raw bytes, tolerating broken/encrypted metadata. */
export async function loadPdf(bytes: ArrayBuffer | Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
}

/** Trigger a browser download of the given bytes. */
export function downloadBytes(bytes: Uint8Array, filename: string, mime = 'application/pdf') {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

export function stripExt(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '')
}

// ── Page manipulation ──────────────────────────────────────────────

export async function mergePdfs(files: File[]): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  for (const file of files) {
    const bytes = await file.arrayBuffer()
    const src = await loadPdf(bytes)
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  return out.save()
}

/** Extract the given 0-based page indices (in that order) into a new PDF. */
export async function extractPages(bytes: ArrayBuffer, indices: number[]): Promise<Uint8Array> {
  const src = await loadPdf(bytes)
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, indices)
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

/** Split every page of a PDF into its own single-page PDF. */
export async function splitEveryPage(bytes: ArrayBuffer): Promise<{ index: number; bytes: Uint8Array }[]> {
  const src = await loadPdf(bytes)
  const total = src.getPageCount()
  const results: { index: number; bytes: Uint8Array }[] = []
  for (let i = 0; i < total; i++) {
    const out = await PDFDocument.create()
    const [page] = await out.copyPages(src, [i])
    out.addPage(page)
    results.push({ index: i, bytes: await out.save() })
  }
  return results
}

export async function removePages(bytes: ArrayBuffer, indicesToRemove: number[]): Promise<Uint8Array> {
  const src = await loadPdf(bytes)
  const total = src.getPageCount()
  const remove = new Set(indicesToRemove)
  const keep = Array.from({ length: total }, (_, i) => i).filter((i) => !remove.has(i))
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, keep)
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

/** Reorder + optionally per-page rotate (deg 0/90/180/270) in one pass. */
export async function reorderAndRotatePages(
  bytes: ArrayBuffer,
  order: { index: number; rotate: number }[]
): Promise<Uint8Array> {
  const src = await loadPdf(bytes)
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, order.map((o) => o.index))
  pages.forEach((p, i) => {
    const extra = order[i].rotate
    if (extra) p.setRotation(degrees((p.getRotation().angle + extra) % 360))
    out.addPage(p)
  })
  return out.save()
}

export async function rotateAllPages(bytes: ArrayBuffer, by: number): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  for (const page of doc.getPages()) {
    page.setRotation(degrees((page.getRotation().angle + by + 360) % 360))
  }
  return doc.save()
}

export async function reversePages(bytes: ArrayBuffer): Promise<Uint8Array> {
  const src = await loadPdf(bytes)
  const total = src.getPageCount()
  const order = Array.from({ length: total }, (_, i) => total - 1 - i)
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, order)
  pages.forEach((p) => out.addPage(p))
  return out.save()
}

/**
 * pdf-lib's embedPdf/embedPage refuses to embed a page that has no content
 * stream at all (e.g. a truly empty page with zero draw operations). Force
 * one to exist on every page via a no-op draw before embedding.
 */
async function withGuaranteedContentStreams(bytes: ArrayBuffer): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  for (const page of doc.getPages()) {
    page.drawRectangle({ x: 0, y: 0, width: 0, height: 0 })
  }
  return doc.save()
}

export async function resizeToA4(bytes: ArrayBuffer): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const src = await loadPdf(bytes)
  const indices = src.getPageIndices()
  const patched = await withGuaranteedContentStreams(bytes)
  const embeddedPages = await out.embedPdf(patched, indices)
  const [A4W, A4H] = PageSizes.A4
  for (const ep of embeddedPages) {
    const page = out.addPage([A4W, A4H])
    const scale = Math.min(A4W / ep.width, A4H / ep.height)
    const w = ep.width * scale
    const h = ep.height * scale
    page.drawPage(ep, { x: (A4W - w) / 2, y: (A4H - h) / 2, width: w, height: h })
  }
  return out.save()
}

const N_UP_LAYOUTS: Record<number, { cols: number; rows: number }> = {
  2: { cols: 1, rows: 2 },
  4: { cols: 2, rows: 2 },
  6: { cols: 2, rows: 3 },
  9: { cols: 3, rows: 3 },
}

export async function nUpPdf(bytes: ArrayBuffer, n: 2 | 4 | 6 | 9): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const src = await loadPdf(bytes)
  const indices = src.getPageIndices()
  const patched = await withGuaranteedContentStreams(bytes)
  const embeddedPages = await out.embedPdf(patched, indices)
  const [A4W, A4H] = PageSizes.A4
  const { cols, rows } = N_UP_LAYOUTS[n]
  const margin = 18
  const cellW = (A4W - margin * 2) / cols
  const cellH = (A4H - margin * 2) / rows

  for (let i = 0; i < embeddedPages.length; i += n) {
    const page = out.addPage([A4W, A4H])
    const group = embeddedPages.slice(i, i + n)
    group.forEach((ep, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      const scale = Math.min(cellW / ep.width, cellH / ep.height) * 0.92
      const w = ep.width * scale
      const h = ep.height * scale
      const x = margin + col * cellW + (cellW - w) / 2
      const y = A4H - margin - (row + 1) * cellH + (cellH - h) / 2
      page.drawPage(ep, { x, y, width: w, height: h })
    })
  }
  return out.save()
}

// ── Watermark / page numbers ────────────────────────────────────────

/** Parse a "#rrggbb" string into 0–1 fractions, defaulting to mid-gray. */
function hexToRgb01(hex?: string): { r: number; g: number; b: number } {
  const clean = (hex ?? '#808080').replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16) / 255
  const g = parseInt(clean.substring(2, 4), 16) / 255
  const b = parseInt(clean.substring(4, 6), 16) / 255
  return { r, g, b }
}

export async function addTextWatermark(
  bytes: ArrayBuffer,
  text: string,
  opts?: { opacity?: number; size?: number; color?: string }
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const opacity = opts?.opacity ?? 0.22
  const requestedSize = opts?.size ?? 48
  const { r, g, b } = hexToRgb01(opts?.color)
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()

    // A page's content lives in its own *unrotated* coordinate space —
    // /Rotate is a display-time transform applied on top of that (common
    // on scanned/photographed pages, e.g. from a phone scanning app).
    // Work out the angle a *viewer* will actually see as the bottom-left
    // → top-right diagonal, then rotate the content in the opposite
    // sense of the page's own rotation so it still reads that way once
    // displayed.
    const rotation = ((page.getRotation().angle % 360) + 360) % 360
    const swapped = rotation === 90 || rotation === 270
    const visW = swapped ? height : width
    const visH = swapped ? width : height
    const visualAngleRad = Math.atan2(visH, visW)
    const angleRad = visualAngleRad + (rotation * Math.PI) / 180
    const cosT = Math.cos(angleRad)
    const sinT = Math.sin(angleRad)

    // Shrink to fit if the text would run past the page edge at the
    // requested size — bound independently on each axis using the actual
    // placement angle (not just the page diagonal), since a compensating
    // rotation for a /Rotate'd page can point steeper than the diagonal.
    let size = requestedSize
    let textWidth = font.widthOfTextAtSize(text, size)
    const margin = 0.92
    const maxHalfWidth = margin * Math.min(
      width / (2 * Math.max(Math.abs(cosT), 1e-6)),
      height / (2 * Math.max(Math.abs(sinT), 1e-6))
    )
    if (textWidth / 2 > maxHalfWidth) {
      size = Math.max(6, size * (maxHalfWidth / (textWidth / 2)))
      textWidth = font.widthOfTextAtSize(text, size)
    }

    // pdf-lib draws text starting at (x, y) and extending along the
    // rotated direction (cos, sin) — so centering the drawn block on the
    // page center means walking the half-width offset backwards along
    // that same rotated direction, not along the page's plain x-axis.
    const halfW = textWidth / 2
    const x = width / 2 - halfW * cosT
    const y = height / 2 - halfW * sinT

    page.drawText(text, {
      x,
      y,
      size,
      font,
      color: rgb(r, g, b),
      opacity,
      rotate: degrees((angleRad * 180) / Math.PI),
    })
  }
  return doc.save()
}

export type PageNumberPosition = 'bottom-center' | 'bottom-right' | 'bottom-left'

export async function addPageNumbers(
  bytes: ArrayBuffer,
  opts?: { position?: PageNumberPosition; startAt?: number }
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()
  const total = pages.length
  const startAt = opts?.startAt ?? 1
  const position = opts?.position ?? 'bottom-center'
  const size = 10

  pages.forEach((page, i) => {
    const { width } = page.getSize()
    const label = `${i + startAt} / ${total + startAt - 1}`
    const textWidth = font.widthOfTextAtSize(label, size)
    let x = width / 2 - textWidth / 2
    if (position === 'bottom-right') x = width - 36 - textWidth
    if (position === 'bottom-left') x = 36
    page.drawText(label, { x, y: 22, size, font, color: rgb(0.35, 0.35, 0.35) })
  })
  return doc.save()
}

export async function removeMetadata(bytes: ArrayBuffer): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  doc.setTitle('')
  doc.setAuthor('')
  doc.setSubject('')
  doc.setKeywords([])
  doc.setProducer('')
  doc.setCreator('')
  return doc.save()
}

export interface CompressPdfResult {
  bytes: Uint8Array
  imagesCompressed: number
  imagesSkipped: number
  originalSize: number
  compressedSize: number
}

/**
 * Shrink a PDF by recompressing its embedded JPEG images (the usual source
 * of PDF bloat — scanned pages, photos). Images encoded with any filter
 * other than plain DCTDecode (raw bitmaps, CCITT fax, JBIG2, JPX — rarer,
 * and much harder to safely round-trip in the browser) are left untouched
 * rather than risking corrupting them. Vector text and line art are
 * completely unaffected either way.
 */
export async function compressPdf(
  bytes: ArrayBuffer,
  opts?: { quality?: number; maxDimension?: number; onProgress?: (done: number, total: number) => void }
): Promise<CompressPdfResult> {
  const quality = opts?.quality ?? 0.6
  const maxDimension = opts?.maxDimension
  const doc = await loadPdf(bytes)

  const imageObjects = doc.context
    .enumerateIndirectObjects()
    .filter(([, obj]) => {
      if (!(obj instanceof PDFRawStream)) return false
      const subtype = obj.dict.lookup(PDFName.of('Subtype'))
      if (!(subtype instanceof PDFName) || subtype.asString() !== '/Image') return false
      const filter = obj.dict.lookup(PDFName.of('Filter'))
      return filter instanceof PDFName && filter.asString() === '/DCTDecode'
    })

  let imagesCompressed = 0
  let imagesSkipped = 0
  let done = 0

  for (const [ref, obj] of imageObjects) {
    const stream = obj as PDFRawStream
    done++
    opts?.onProgress?.(done, imageObjects.length)
    try {
      const originalBytes = stream.getContents()
      const blob = new Blob([new Uint8Array(originalBytes)], { type: 'image/jpeg' })
      const bitmap = await createImageBitmap(blob)
      let { width, height } = bitmap
      if (maxDimension && Math.max(width, height) > maxDimension) {
        const scale = maxDimension / Math.max(width, height)
        width = Math.max(1, Math.round(width * scale))
        height = Math.max(1, Math.round(height * scale))
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0, width, height)
      bitmap.close()
      const newBlob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', quality)
      )
      const newBytes = new Uint8Array(await newBlob.arrayBuffer())

      if (newBytes.length < originalBytes.length) {
        // PDFRawStream.contents is read-only — build a replacement stream
        // object (cloned dict, adjusted for the re-encoded bytes) and swap
        // it in under the same reference.
        const dict = stream.dict.clone(doc.context)
        // The re-encoded canvas output is always an RGB JPEG, regardless of
        // the original color space (grayscale, CMYK, indexed, …) — the
        // dict must match or viewers will render it with wrong colors.
        dict.set(PDFName.of('Width'), PDFNumber.of(width))
        dict.set(PDFName.of('Height'), PDFNumber.of(height))
        dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'))
        dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8))
        dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'))
        dict.set(PDFName.of('Length'), PDFNumber.of(newBytes.length))
        dict.delete(PDFName.of('Decode'))
        dict.delete(PDFName.of('DecodeParms'))
        doc.context.assign(ref, PDFRawStream.of(dict, newBytes))
        imagesCompressed++
      } else {
        imagesSkipped++
      }
    } catch {
      imagesSkipped++
    }
  }

  const originalSize = bytes.byteLength
  const outBytes = await doc.save()
  return {
    bytes: outBytes,
    imagesCompressed,
    imagesSkipped,
    originalSize,
    compressedSize: outBytes.length,
  }
}

// ── Images ⇄ PDF ─────────────────────────────────────────────────────

/** Decode any browser-supported image file and re-encode as a JPEG, honoring EXIF orientation. */
export async function imageFileToJpegBytes(file: File, quality = 0.92): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file)
  }
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/jpeg', quality)
  )
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height }
}

/** Re-encode an image at a reduced quality / max dimension to shrink its file size. */
export async function compressImageFile(
  file: File,
  opts?: { quality?: number; maxDimension?: number }
): Promise<{ blob: Blob; width: number; height: number }> {
  const quality = opts?.quality ?? 0.75
  const maxDimension = opts?.maxDimension
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file)
  }
  let { width, height } = bitmap
  if (maxDimension && Math.max(width, height) > maxDimension) {
    const scale = maxDimension / Math.max(width, height)
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const keepsAlpha = file.type === 'image/png'
  if (!keepsAlpha) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const outMime = keepsAlpha ? 'image/png' : 'image/jpeg'
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), outMime, outMime === 'image/jpeg' ? quality : undefined)
  )
  return { blob, width, height }
}

export async function imagesToPdf(files: File[], opts?: { fitToA4?: boolean }): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const fitToA4 = opts?.fitToA4 ?? false
  const [A4W, A4H] = PageSizes.A4
  for (const file of files) {
    const { bytes, width, height } = await imageFileToJpegBytes(file)
    const img = await doc.embedJpg(bytes)
    if (fitToA4) {
      const page = doc.addPage([A4W, A4H])
      const scale = Math.min((A4W - 40) / width, (A4H - 40) / height)
      const w = width * scale
      const h = height * scale
      page.drawImage(img, { x: (A4W - w) / 2, y: (A4H - h) / 2, width: w, height: h })
    } else {
      const page = doc.addPage([width, height])
      page.drawImage(img, { x: 0, y: 0, width, height })
    }
  }
  return doc.save()
}

/**
 * Stamp the same diagonal (bottom-left → top-right) text watermark used on
 * PDFs onto a JPG/PNG/GIF image. Output keeps PNG for PNG input (preserves
 * transparency), JPEG for everything else; GIF input is flattened to its
 * first frame and exported as PNG since canvas has no animated-GIF encoder.
 */
export async function addImageWatermark(
  file: File,
  text: string,
  opts?: { opacity?: number; size?: number; color?: string; quality?: number }
): Promise<{ blob: Blob; note?: string }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await createImageBitmap(file)
  }
  const { width, height } = bitmap
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const isPng = file.type === 'image/png'
  const isGif = file.type === 'image/gif'
  const outputsPng = isPng || isGif
  if (!outputsPng) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const opacity = opts?.opacity ?? 0.22
  const requestedSize = opts?.size ?? 48
  const color = opts?.color ?? '#808080'

  // atan2(height, width) is the bottom-left→top-right diagonal angle in
  // normal (y-up) math terms, same as the PDF version. Canvas is y-down, so
  // rotating by the *negative* of that angle produces the same visual
  // up-and-to-the-right direction on screen.
  const theta = Math.atan2(height, width)

  ctx.font = `bold ${requestedSize}px Arial, Helvetica, sans-serif`
  let size = requestedSize
  let textWidth = ctx.measureText(text).width
  const margin = 0.92
  const cosT = Math.cos(theta)
  const sinT = Math.sin(theta)
  const maxHalfWidth = margin * Math.min(width / (2 * Math.max(cosT, 1e-6)), height / (2 * Math.max(sinT, 1e-6)))
  if (textWidth / 2 > maxHalfWidth) {
    size = Math.max(6, size * (maxHalfWidth / (textWidth / 2)))
    ctx.font = `bold ${size}px Arial, Helvetica, sans-serif`
    textWidth = ctx.measureText(text).width
  }

  ctx.save()
  ctx.translate(width / 2, height / 2)
  ctx.rotate(-theta)
  ctx.globalAlpha = opacity
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
  ctx.restore()

  const outMime = outputsPng ? 'image/png' : 'image/jpeg'
  const quality = opts?.quality ?? 0.92
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), outMime, outMime === 'image/jpeg' ? quality : undefined)
  )
  return { blob, note: isGif ? 'GIF was exported as a PNG (first frame only) — animated GIFs can’t be watermarked frame-by-frame in the browser.' : undefined }
}

// ── Sign PDF ─────────────────────────────────────────────────────────

/**
 * A signature/name/date stamp placed on one page. Coordinates use screen
 * convention — (0,0) is the page's top-left corner, y grows downward,
 * matching the drag-to-position live preview — and get flipped to
 * pdf-lib's bottom-up y-axis in signPdf(). All fractions are relative to
 * that page's own width/height, so placement survives pages of different
 * sizes in the same document.
 */
export type SignElement =
  | { id: string; kind: 'image'; pageIndex: number; xPct: number; yPct: number; widthPct: number; aspect: number; dataUrl: string }
  | { id: string; kind: 'text'; pageIndex: number; xPct: number; yPct: number; text: string; color: string; sizePt: number }

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

let sarabunBytesPromise: Promise<ArrayBuffer> | null = null
function getSarabunBytes(): Promise<ArrayBuffer> {
  if (!sarabunBytesPromise) {
    sarabunBytesPromise = fetch('/fonts/Sarabun-Regular.ttf').then((r) => r.arrayBuffer())
  }
  return sarabunBytesPromise
}

/**
 * Embed the bundled Sarabun Thai font into a PDFDocument (registering
 * fontkit on it first). pdf-lib's standard 14 fonts (Helvetica etc.) are
 * WinAnsi/Latin-only and throw on Thai characters, which this app draws
 * routinely (signature name/date stamps, generated Thai forms).
 */
export async function embedThaiFont(doc: PDFDocument): Promise<PDFFont> {
  const fontkit = (await import('@pdf-lib/fontkit')).default
  doc.registerFontkit(fontkit)
  const fontBytes = await getSarabunBytes()
  return doc.embedFont(fontBytes)
}

/** Stamp signature images and text labels onto specific pages. */
export async function signPdf(bytes: ArrayBuffer, elements: SignElement[]): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const pages = doc.getPages()

  let thaiFont: PDFFont | null = null
  async function getThaiFont(): Promise<PDFFont> {
    if (!thaiFont) thaiFont = await embedThaiFont(doc)
    return thaiFont
  }

  const imageCache = new Map<string, PDFImage>()
  async function getImage(dataUrl: string): Promise<PDFImage> {
    let img = imageCache.get(dataUrl)
    if (!img) {
      img = await doc.embedPng(dataUrlToBytes(dataUrl))
      imageCache.set(dataUrl, img)
    }
    return img
  }

  for (const el of elements) {
    const page = pages[el.pageIndex]
    if (!page) continue
    const { width, height } = page.getSize()

    if (el.kind === 'image') {
      const img = await getImage(el.dataUrl)
      const w = el.widthPct * width
      const h = w * el.aspect
      const x = el.xPct * width
      const y = height - el.yPct * height - h
      page.drawImage(img, { x, y, width: w, height: h })
    } else {
      const font = await getThaiFont()
      const size = el.sizePt
      const x = el.xPct * width
      const y = height - el.yPct * height - size
      const { r, g, b } = hexToRgb01(el.color)
      page.drawText(el.text, { x, y, size, font, color: rgb(r, g, b) })
    }
  }

  return doc.save()
}

// ── Time attendance form (PC Team 4) ────────────────────────────────

export interface TimesheetRow {
  day: number
  timeIn: string
  timeOut: string
  remark: string
}

export interface TimesheetOptions {
  name: string
  persNo: string
  position: string
  month: number // 1–12
  year: number
  approverName: string
  rows: TimesheetRow[]
}

const TIMESHEET_MONTH_ABBR = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

function drawCenteredText(page: PDFPage, font: PDFFont, text: string, xStart: number, xEnd: number, y: number, size: number, color: ReturnType<typeof rgb>) {
  if (!text) return
  let s = size
  let w = font.widthOfTextAtSize(text, s)
  const maxW = xEnd - xStart - 4
  if (w > maxW && maxW > 0) {
    s = Math.max(5, s * (maxW / w))
    w = font.widthOfTextAtSize(text, s)
  }
  page.drawText(text, { x: xStart + (xEnd - xStart - w) / 2, y, size: s, font, color })
}

/**
 * Draw the PC Team 4 monthly time-attendance form from scratch (this isn't
 * filling an existing PDF template — the source is a plain printed table,
 * so it's recreated with pdf-lib's drawing primitives instead). Row height
 * is computed from the day count so any month (28–31 days) fits one A4
 * page, matching the original's dense one-page layout.
 */
export async function generateTimesheetPdf(opts: TimesheetOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await embedThaiFont(doc)
  const page = doc.addPage(PageSizes.A4)
  const { width: pageW, height: pageH } = page.getSize()

  const margin = 36
  const tableLeft = margin
  const tableWidth = pageW - margin * 2
  const black = rgb(0.1, 0.1, 0.1)

  let y = pageH - margin

  try {
    const logoBytes = await (await fetch('/thai-logo.png')).arrayBuffer()
    const logo = await doc.embedPng(logoBytes)
    const logoH = 22
    const logoW = logoH * (logo.width / logo.height)
    page.drawImage(logo, { x: margin, y: y - logoH, width: logoW, height: logoH })
    page.drawText('ตารางบันทึกเวลาปฏิบัติงานของพนักงานต้อนรับฯ ที่ช่วยปฏิบัติหน้าที่ในกลุ่มงาน PC Team 4', {
      x: margin + logoW + 8, y: y - 14, size: 10.5, font, color: black,
    })
  } catch {
    page.drawText('ตารางบันทึกเวลาปฏิบัติงานของพนักงานต้อนรับฯ ที่ช่วยปฏิบัติหน้าที่ในกลุ่มงาน PC Team 4', {
      x: margin, y: y - 14, size: 10.5, font, color: black,
    })
  }
  y -= 34

  const infoLine = [
    `ชื่อ: ${opts.name || '-'}`,
    `Pers.No.: ${opts.persNo || '-'}`,
    `ตำแหน่ง: ${opts.position}`,
    `เดือน: ${TIMESHEET_MONTH_ABBR[opts.month - 1]}`,
    `ปี: ${opts.year}`,
  ].join('     ')
  page.drawText(infoLine, { x: margin, y, size: 10, font, color: black })
  y -= 20

  const colDay = 34
  const colIn = 105
  const colOut = 105
  const colXs = [tableLeft, tableLeft + colDay, tableLeft + colDay + colIn, tableLeft + colDay + colIn + colOut, tableLeft + tableWidth]
  const headerRow1H = 15
  const headerRow2H = 14
  const footerBlockH = 100
  const numRows = Math.max(1, opts.rows.length)
  const availableForRows = y - headerRow1H - headerRow2H - (margin + footerBlockH)
  const rowH = Math.max(11, availableForRows / numRows)

  let cy = y
  const drawGridRow = (h: number, thickness: number) => {
    for (let i = 0; i < colXs.length - 1; i++) {
      page.drawRectangle({ x: colXs[i], y: cy - h, width: colXs[i + 1] - colXs[i], height: h, borderColor: black, borderWidth: thickness })
    }
  }

  // Header row 1: two merged cells (record columns / remarks column).
  page.drawRectangle({ x: colXs[0], y: cy - headerRow1H, width: colXs[3] - colXs[0], height: headerRow1H, borderColor: black, borderWidth: 0.75 })
  page.drawRectangle({ x: colXs[3], y: cy - headerRow1H, width: colXs[4] - colXs[3], height: headerRow1H, borderColor: black, borderWidth: 0.75 })
  drawCenteredText(page, font, 'บันทึกเวลาปฏิบัติงาน (ยกเว้น เสาร์-อาทิตย์ และวันหยุดนักขัตฤกษ์)', colXs[0], colXs[3], cy - headerRow1H + 4.5, 7.5, black)
  drawCenteredText(page, font, 'หมายเหตุ', colXs[3], colXs[4], cy - headerRow1H + 4.5, 8, black)
  cy -= headerRow1H

  // Header row 2: column labels.
  drawGridRow(headerRow2H, 0.75)
  drawCenteredText(page, font, 'วันที่', colXs[0], colXs[1], cy - headerRow2H + 4, 7.5, black)
  drawCenteredText(page, font, 'เวลาเข้า', colXs[1], colXs[2], cy - headerRow2H + 4, 7.5, black)
  drawCenteredText(page, font, 'เวลาออก', colXs[2], colXs[3], cy - headerRow2H + 4, 7.5, black)
  drawCenteredText(page, font, '(เช่น Office, Work from Home เป็นต้น)', colXs[3], colXs[4], cy - headerRow2H + 4, 6.5, black)
  cy -= headerRow2H

  for (const row of opts.rows) {
    drawGridRow(rowH, 0.5)
    const textY = cy - rowH / 2 - 2.8
    const fs = Math.min(8, Math.max(5, rowH - 4))
    drawCenteredText(page, font, String(row.day), colXs[0], colXs[1], textY, fs, black)
    drawCenteredText(page, font, row.timeIn, colXs[1], colXs[2], textY, fs, black)
    drawCenteredText(page, font, row.timeOut, colXs[2], colXs[3], textY, fs, black)
    drawCenteredText(page, font, row.remark, colXs[3], colXs[4], textY, fs, black)
    cy -= rowH
  }

  y = cy - 26
  page.drawText('พนักงานลงชื่อ', { x: margin, y, size: 9, font, color: black })
  page.drawText('ผู้ขอลงเวลา', { x: margin + 220, y, size: 9, font, color: black })
  y -= 22
  page.drawText(`( ${opts.name || '.....................................'} )`, { x: margin + 20, y, size: 9, font, color: black })
  y -= 24
  page.drawText('ผู้รับรอง (ระดับ 8,9)', { x: margin, y, size: 9, font, color: black })
  y -= 22
  page.drawText(`( ${opts.approverName || '.....................................'} )`, { x: margin + 20, y, size: 9, font, color: black })

  return doc.save()
}
