'use client'

import { useEffect, useRef, useState } from 'react'
import { loadPdfJsDocument, renderPageDataUrl } from './pdfjs'

export interface PageThumb {
  index: number // 0-based
  dataUrl: string
}

/** Renders every page of a PDF File to a thumbnail data URL. */
export function usePdfThumbnails(file: File | null, scale = 0.3) {
  const [thumbs, setThumbs] = useState<PageThumb[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const genRef = useRef(0)

  useEffect(() => {
    const myGen = ++genRef.current
    ;(async () => {
      if (!file) {
        setThumbs([])
        return
      }
      setLoading(true)
      setError(null)
      setThumbs([])
      try {
        const bytes = await file.arrayBuffer()
        const doc = await loadPdfJsDocument(bytes)
        const results: PageThumb[] = []
        for (let i = 1; i <= doc.numPages; i++) {
          if (genRef.current !== myGen) return
          const { dataUrl } = await renderPageDataUrl(doc, i, scale, 'image/jpeg')
          results.push({ index: i - 1, dataUrl })
          setThumbs([...results])
        }
        doc.destroy()
      } catch (e) {
        if (genRef.current === myGen) setError((e as Error).message || 'Failed to read PDF')
      } finally {
        if (genRef.current === myGen) setLoading(false)
      }
    })()
  }, [file, scale])

  return { thumbs, loading, error }
}
