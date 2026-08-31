import { PDFDocument, PageSizes, StandardFonts, degrees, rgb, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'

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

export async function addTextWatermark(
  bytes: ArrayBuffer,
  text: string,
  opts?: { opacity?: number; size?: number; colorGray?: number }
): Promise<Uint8Array> {
  const doc = await loadPdf(bytes)
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const opacity = opts?.opacity ?? 0.22
  const requestedSize = opts?.size ?? 48
  const gray = opts?.colorGray ?? 0.5
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
      color: rgb(gray, gray, gray),
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
  opts?: { opacity?: number; size?: number; colorGray?: number; quality?: number }
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
  const gray = opts?.colorGray ?? 0.5

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
  const g = Math.round(gray * 255)
  ctx.fillStyle = `rgb(${g}, ${g}, ${g})`
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
