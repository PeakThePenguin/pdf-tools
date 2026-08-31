'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { usePdfThumbnails } from '@/app/lib/usePdfThumbnails'
import { removePages, downloadBytes, stripExt } from '@/app/lib/engine'

export default function RemovePagesPage() {
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

  async function handleRemove() {
    if (!file || selected.size === 0) return
    if (selected.size >= thumbs.length) { setError('Cannot remove every page.'); return }
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const out = await removePages(bytes, Array.from(selected))
      downloadBytes(out, `${stripExt(file.name)}_removed.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to remove pages.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="REMOVE PAGES" subtitle="Delete specific pages from a PDF">
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
            <p className="text-[11px] text-gray-500">Tap pages to mark them for removal — {selected.size} selected</p>
            <div className="grid grid-cols-3 gap-2">
              {thumbs.map((t) => {
                const isSel = selected.has(t.index)
                return (
                  <div
                    key={t.index}
                    onClick={() => toggle(t.index)}
                    className="relative border rounded overflow-hidden bg-gray-50 cursor-pointer"
                    style={{ aspectRatio: '3/4', borderColor: isSel ? '#dc2626' : '#e5e7eb', borderWidth: isSel ? 2 : 1 }}
                  >
                    <img src={t.dataUrl} alt={`Page ${t.index + 1}`} className="w-full h-full object-contain" style={{ opacity: isSel ? 0.35 : 1 }} />
                    <span className="absolute bottom-0.5 left-0.5 text-[9px] font-bold text-white px-1 rounded" style={{ background: 'rgba(0,0,0,0.55)' }}>
                      {t.index + 1}
                    </span>
                    {isSel && (
                      <span className="absolute inset-0 flex items-center justify-center text-white text-lg font-bold" style={{ background: 'rgba(220,38,38,0.25)' }}>
                        ✕
                      </span>
                    )}
                  </div>
                )
              })}
            </div>

            <button
              onClick={handleRemove}
              disabled={busy || selected.size === 0}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: '#dc2626', borderRadius: 4 }}
            >
              {busy ? 'Removing…' : `Remove ${selected.size || ''} page${selected.size === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
