'use client'

import { useState } from 'react'
import JSZip from 'jszip'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { loadPdfJsDocument, renderPageBlob } from '@/app/lib/pdfjs'
import { downloadBlob, stripExt } from '@/app/lib/engine'

export default function PdfToImagesPage() {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg')
  const [scale, setScale] = useState(2)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const doc = await loadPdfJsDocument(bytes)
      const ext = format === 'image/jpeg' ? 'jpg' : 'png'
      const pad = String(doc.numPages).length

      if (doc.numPages === 1) {
        const blob = await renderPageBlob(doc, 1, scale, format)
        downloadBlob(blob, `${stripExt(file.name)}.${ext}`)
      } else {
        const zip = new JSZip()
        for (let i = 1; i <= doc.numPages; i++) {
          setProgress(`Rendering page ${i} / ${doc.numPages}…`)
          const blob = await renderPageBlob(doc, i, scale, format)
          zip.file(`${stripExt(file.name)}_page_${String(i).padStart(pad, '0')}.${ext}`, blob)
        }
        setProgress('Zipping…')
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        downloadBlob(zipBlob, `${stripExt(file.name)}_images.zip`)
      }
      doc.destroy()
    } catch (e) {
      setError((e as Error).message || 'Failed to export images.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <ToolShell title="PDF → IMAGES" subtitle="Export every page as JPG or PNG">
      <div className="px-3 pt-3 space-y-3">
        {!file && <FileDrop accept="application/pdf" onFiles={(f) => setFile(f[0])} />}

        {file && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 truncate">{file.name}</span>
            <button className="text-xs font-semibold" style={{ color: 'var(--purple)' }} onClick={() => setFile(null)}>
              Change file
            </button>
          </div>
        )}

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {file && (
          <>
            <div>
              <p className="text-[11px] text-gray-500 mb-1">Format</p>
              <div className="grid grid-cols-2 gap-2">
                {(['image/jpeg', 'image/png'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className="py-2 font-bold text-xs"
                    style={{
                      border: `2px solid ${format === f ? 'var(--purple)' : '#e5e7eb'}`,
                      color: format === f ? 'var(--purple)' : '#666',
                      background: format === f ? '#f3e8ff' : '#fff',
                      borderRadius: 4,
                    }}
                  >
                    {f === 'image/jpeg' ? 'JPG' : 'PNG'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[11px] text-gray-500 mb-1">Quality: {scale === 1 ? 'Standard' : scale === 2 ? 'High' : 'Very high'}</p>
              <input type="range" min={1} max={3} step={1} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full" />
            </div>

            <button
              onClick={handleRun}
              disabled={busy}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? (progress || 'Rendering…') : 'Export images'}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
