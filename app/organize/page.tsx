'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { usePdfThumbnails } from '@/app/lib/usePdfThumbnails'
import { reorderAndRotatePages, downloadBytes, stripExt } from '@/app/lib/engine'

interface Entry { origIndex: number; rotate: number; dataUrl: string }

export default function OrganizePage() {
  const [file, setFile] = useState<File | null>(null)
  const { thumbs, loading, error: thumbError } = usePdfThumbnails(file, 0.3)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loadedThumbs, setLoadedThumbs] = useState(thumbs)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Re-seed the editable entry list whenever a new set of thumbnails finishes
  // loading (adjusting state during render, per React's guidance, rather
  // than in an Effect — this isn't reacting to an external system).
  if (thumbs !== loadedThumbs && thumbs.length > 0) {
    setLoadedThumbs(thumbs)
    setEntries(thumbs.map((t) => ({ origIndex: t.index, rotate: 0, dataUrl: t.dataUrl })))
  }

  function onDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return
    setEntries((prev) => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(targetIndex, 0, moved)
      return next
    })
    setDragIndex(null)
  }

  function rotateOne(i: number) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, rotate: (e.rotate + 90) % 360 } : e)))
  }

  function deleteOne(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave() {
    if (!file || entries.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const out = await reorderAndRotatePages(bytes, entries.map((e) => ({ index: e.origIndex, rotate: e.rotate })))
      downloadBytes(out, `${stripExt(file.name)}_organized.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to save PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="ORGANIZE PAGES" subtitle="Reorder, rotate, or delete pages">
      <div className="px-3 pt-3 space-y-3">
        {!file && <FileDrop accept="application/pdf" onFiles={(f) => setFile(f[0])} />}

        {file && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 truncate">{file.name}</span>
            <button className="text-xs font-semibold" style={{ color: 'var(--purple)' }} onClick={() => { setFile(null); setEntries([]) }}>
              Change file
            </button>
          </div>
        )}

        {(error || thumbError) && <p className="text-xs" style={{ color: '#dc2626' }}>{error || thumbError}</p>}

        {loading && <p className="text-xs text-gray-500">Loading pages…</p>}

        {entries.length > 0 && (
          <>
            <p className="text-[13px] text-gray-500">Drag to reorder · tap ↻ to rotate · tap ✕ to delete</p>
            <div className="grid grid-cols-3 gap-2">
              {entries.map((e, i) => (
                <div
                  key={`${e.origIndex}-${i}`}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(ev) => ev.preventDefault()}
                  onDrop={() => onDrop(i)}
                  className="relative border border-gray-200 rounded overflow-hidden bg-gray-50"
                  style={{ aspectRatio: '3/4', cursor: 'grab' }}
                >
                  <img
                    src={e.dataUrl}
                    alt={`Page ${e.origIndex + 1}`}
                    className="w-full h-full object-contain"
                    style={{ transform: `rotate(${e.rotate}deg)` }}
                  />
                  <span className="absolute bottom-0.5 left-0.5 text-[11px] font-bold text-white px-1 rounded" style={{ background: 'rgba(0,0,0,0.55)' }}>
                    {i + 1}
                  </span>
                  <div className="absolute top-0.5 right-0.5 flex gap-0.5">
                    <button onClick={() => rotateOne(i)} className="w-5 h-5 flex items-center justify-center text-[12px] rounded text-white" style={{ background: 'rgba(0,0,0,0.55)' }}>↻</button>
                    <button onClick={() => deleteOne(i)} className="w-5 h-5 flex items-center justify-center text-[12px] rounded text-white" style={{ background: 'rgba(220,38,38,0.85)' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleSave}
              disabled={busy}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? 'Saving…' : `Save PDF (${entries.length} page${entries.length === 1 ? '' : 's'})`}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
