'use client'

import { useState } from 'react'
import JSZip from 'jszip'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { usePdfThumbnails } from '@/app/lib/usePdfThumbnails'
import { extractPages, splitEveryPage, downloadBytes, downloadBlob, stripExt } from '@/app/lib/engine'

export default function SplitPage() {
  const [file, setFile] = useState<File | null>(null)
  const { thumbs, loading, error: thumbError } = usePdfThumbnails(file, 0.3)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggle(i: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  async function handleExtract() {
    if (!file || selected.size === 0) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const indices = Array.from(selected).sort((a, b) => a - b)
      const out = await extractPages(bytes, indices)
      downloadBytes(out, `${stripExt(file.name)}_extracted.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to extract pages.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSplitAll() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const results = await splitEveryPage(bytes)
      const zip = new JSZip()
      const pad = String(results.length).length
      for (const r of results) {
        zip.file(`${stripExt(file.name)}_page_${String(r.index + 1).padStart(pad, '0')}.pdf`, r.bytes)
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      downloadBlob(blob, `${stripExt(file.name)}_split.zip`)
    } catch (e) {
      setError((e as Error).message || 'Failed to split PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="SPLIT / EXTRACT" subtitle="Pull out pages, or split every page apart">
      <div className="px-3 pt-3 space-y-3">
        {!file && <FileDrop accept="application/pdf" onFiles={(f) => { setFile(f[0]); setSelected(new Set()) }} />}

        {file && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 truncate">{file.name}</span>
            <button className="text-xs font-semibold" style={{ color: 'var(--purple)' }} onClick={() => { setFile(null); setSelected(new Set()) }}>
              Change file
            </button>
          </div>
        )}

        {(error || thumbError) && <p className="text-xs" style={{ color: '#dc2626' }}>{error || thumbError}</p>}
        {loading && <p className="text-xs text-gray-500">Loading pages…</p>}

        {thumbs.length > 0 && (
          <>
            <button
              onClick={handleSplitAll}
              disabled={busy}
              className="w-full py-2.5 font-bold text-xs disabled:opacity-40"
              style={{ background: '#fff', color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 4 }}
            >
              {busy ? 'Splitting…' : `Split all ${thumbs.length} pages into separate PDFs (.zip)`}
            </button>

            <p className="text-[13px] text-gray-500">— or tap pages below to select which to extract —</p>

            <div className="grid grid-cols-3 gap-2">
              {thumbs.map((t) => {
                const isSel = selected.has(t.index)
                return (
                  <div
                    key={t.index}
                    onClick={() => toggle(t.index)}
                    className="relative border rounded overflow-hidden bg-gray-50 cursor-pointer"
                    style={{ aspectRatio: '3/4', borderColor: isSel ? 'var(--purple)' : '#e5e7eb', borderWidth: isSel ? 2 : 1 }}
                  >
                    <img src={t.dataUrl} alt={`Page ${t.index + 1}`} className="w-full h-full object-contain" />
                    <span className="absolute bottom-0.5 left-0.5 text-[11px] font-bold text-white px-1 rounded" style={{ background: 'rgba(0,0,0,0.55)' }}>
                      {t.index + 1}
                    </span>
                    {isSel && (
                      <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[12px] text-white font-bold" style={{ background: 'var(--purple)' }}>
                        ✓
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              onClick={handleExtract}
              disabled={busy || selected.size === 0}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? 'Extracting…' : `Extract ${selected.size || ''} selected page${selected.size === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
