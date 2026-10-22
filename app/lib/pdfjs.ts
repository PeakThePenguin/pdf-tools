// Thin wrapper around pdfjs-dist for client-side rendering (thumbnails,
// PDF → image export, text extraction, blank-page detection).
// Dynamically imported so it never lands in a server bundle.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJsLib = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfJsDocument = any

let libPromise: Promise<PdfJsLib> | null = null

function getPdfJsLib(): Promise<PdfJsLib> {
  if (!libPromise) {
    libPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      return mod
    })
  }
  return libPromise
}

export async function loadPdfJsDocument(bytes: ArrayBuffer, password?: string): Promise<PdfJsDocument> {
  const lib = await getPdfJsLib()
  // pdf.js detaches/transfers the buffer — pass a fresh copy in case the
  // caller still needs the original ArrayBuffer.
  const task = lib.getDocument({ data: new Uint8Array(bytes.slice(0)), password })
  return task.promise
}

/**
 * Whether a rejection from loadPdfJsDocument means the PDF needs a password
 * (none given, or the one given was wrong) — pdf.js doesn't export the
 * PasswordException class itself, only the PasswordResponses codes, so this
 * checks the error's name the way pdf.js's own docs recommend.
 */
export function isPasswordError(error: unknown): { needed: true; wrongPassword: boolean } | { needed: false } {
  if (!(error instanceof Error) || error.name !== 'PasswordException') return { needed: false }
  // code 1 = NEED_PASSWORD (none supplied), code 2 = INCORRECT_PASSWORD
  const code = (error as Error & { code?: number }).code
  return { needed: true, wrongPassword: code === 2 }
}

export async function getPageCount(bytes: ArrayBuffer): Promise<number> {
  const doc = await loadPdfJsDocument(bytes)
  const count = doc.numPages
  doc.destroy()
  return count
}

/** Render a 1-based page number to a data URL. */
export async function renderPageDataUrl(
  doc: PdfJsDocument,
  pageNumber: number,
  scale: number,
  mime: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<{ dataUrl: string; width: number; height: number }> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  const ctx = canvas.getContext('2d')!
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  const dataUrl = canvas.toDataURL(mime, mime === 'image/jpeg' ? 0.9 : undefined)
  return { dataUrl, width: canvas.width, height: canvas.height }
}

export async function renderPageBlob(
  doc: PdfJsDocument,
  pageNumber: number,
  scale: number,
  mime: 'image/png' | 'image/jpeg' = 'image/png'
): Promise<Blob> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  const ctx = canvas.getContext('2d')!
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), mime, mime === 'image/jpeg' ? 0.9 : undefined)
  )
}

/**
 * Heuristic blank-page detector: rasterizes the page small and checks what
 * fraction of pixels are non-white. Good enough for scanned-doc cleanup;
 * not a substitute for reading the actual page content.
 */
export async function isPageBlank(doc: PdfJsDocument, pageNumber: number, threshold = 0.003): Promise<boolean> {
  const page = await doc.getPage(pageNumber)
  const viewport = page.getViewport({ scale: 0.25 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(viewport.width))
  canvas.height = Math.max(1, Math.round(viewport.height))
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport, canvas }).promise
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let nonWhite = 0
  const totalPixels = canvas.width * canvas.height
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    if (r < 245 || g < 245 || b < 245) nonWhite++
  }
  return nonWhite / totalPixels < threshold
}
