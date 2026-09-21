'use client'

import { useEffect, useRef, useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { usePdfThumbnails } from '@/app/lib/usePdfThumbnails'
import { loadPdfJsDocument, renderPageDataUrl } from '@/app/lib/pdfjs'
import { cropPdf, downloadBytes, stripExt, type CropRect } from '@/app/lib/engine'

const PREVIEW_SCALE = 1.4
const DEFAULT_BOX = { x: 0.08, y: 0.08, w: 0.84, h: 0.84 }
const MIN_SIZE = 0.05

type Corner = 'nw' | 'ne' | 'sw' | 'se'
type Box = { x: number; y: number; w: number; h: number }

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

export default function CropPdfPage() {
  const [file, setFile] = useState<File | null>(null)
  const { thumbs, loading: thumbsLoading, error: thumbError } = usePdfThumbnails(file, 0.3)
  const [selectedPage, setSelectedPage] = useState(0)
  const [preview, setPreview] = useState<{ dataUrl: string; width: number; height: number } | null>(null)
  const [box, setBox] = useState<Box>(DEFAULT_BOX)
  const [applyToAll, setApplyToAll] = useState(true)

  const previewRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ mode: 'move' | Corner; startX: number; startY: number; startBox: Box } | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function resetForNewFile(f: File | null) {
    setFile(f)
    setSelectedPage(0)
    setPreview(null)
    setBox(DEFAULT_BOX)
    setError(null)
  }

  // Render the selected page at a higher resolution for the crop editor
  // (the thumbnail strip stays at its own low scale).
  useEffect(() => {
    let cancelled = false
    if (!file) return
    ;(async () => {
      try {
        const bytes = await file.arrayBuffer()
        const doc = await loadPdfJsDocument(bytes)
        if (selectedPage >= doc.numPages) {
          doc.destroy()
          return
        }
        const rendered = await renderPageDataUrl(doc, selectedPage + 1, PREVIEW_SCALE, 'image/jpeg')
        doc.destroy()
        if (!cancelled) setPreview(rendered)
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to render page.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file, selectedPage])

  function pointerFrac(e: React.PointerEvent): { x: number; y: number } {
    const rect = previewRef.current!.getBoundingClientRect()
    return { x: clamp01((e.clientX - rect.left) / rect.width), y: clamp01((e.clientY - rect.top) / rect.height) }
  }

  function onBoxPointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    const p = pointerFrac(e)
    dragState.current = { mode: 'move', startX: p.x, startY: p.y, startBox: box }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  function onHandlePointerDown(e: React.PointerEvent, corner: Corner) {
    e.stopPropagation()
    const p = pointerFrac(e)
    dragState.current = { mode: corner, startX: p.x, startY: p.y, startBox: box }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  function onContainerPointerMove(e: React.PointerEvent) {
    const drag = dragState.current
    if (!drag) return
    const p = pointerFrac(e)
    const s = drag.startBox

    if (drag.mode === 'move') {
      const dx = p.x - drag.startX
      const dy = p.y - drag.startY
      const x = Math.min(1 - s.w, Math.max(0, s.x + dx))
      const y = Math.min(1 - s.h, Math.max(0, s.y + dy))
      setBox({ ...s, x, y })
      return
    }

    // Resize from a corner: the opposite corner stays fixed as the anchor,
    // and the dragged corner tracks the pointer directly (clamped to a
    // minimum box size so it can't collapse to nothing).
    const anchorX = drag.mode.includes('w') ? s.x + s.w : s.x
    const anchorY = drag.mode.includes('n') ? s.y + s.h : s.y
    let movingX = p.x
    let movingY = p.y
    if (Math.abs(movingX - anchorX) < MIN_SIZE) movingX = anchorX + (movingX < anchorX ? -MIN_SIZE : MIN_SIZE)
    if (Math.abs(movingY - anchorY) < MIN_SIZE) movingY = anchorY + (movingY < anchorY ? -MIN_SIZE : MIN_SIZE)
    movingX = clamp01(movingX)
    movingY = clamp01(movingY)

    setBox({
      x: Math.min(anchorX, movingX),
      y: Math.min(anchorY, movingY),
      w: Math.abs(movingX - anchorX),
      h: Math.abs(movingY - anchorY),
    })
  }
  function onContainerPointerUp() {
    dragState.current = null
  }

  async function handleCrop() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const doc = await loadPdfJsDocument(bytes)
      const targets = applyToAll ? Array.from({ length: doc.numPages }, (_, i) => i) : [selectedPage]

      const crops: { pageIndex: number; rect: CropRect }[] = []
      for (const pageIndex of targets) {
        const page = await doc.getPage(pageIndex + 1)
        const viewport = page.getViewport({ scale: 1 })
        const x1 = box.x * viewport.width
        const y1 = box.y * viewport.height
        const x2 = (box.x + box.w) * viewport.width
        const y2 = (box.y + box.h) * viewport.height
        const [rx1, ry1] = viewport.convertToPdfPoint(x1, y1) as [number, number]
        const [rx2, ry2] = viewport.convertToPdfPoint(x2, y2) as [number, number]
        const rectX = Math.min(rx1, rx2)
        const rectY = Math.min(ry1, ry2)
        crops.push({ pageIndex, rect: { x: rectX, y: rectY, width: Math.abs(rx2 - rx1), height: Math.abs(ry2 - ry1) } })
      }
      doc.destroy()

      const out = await cropPdf(bytes, crops)
      downloadBytes(out, `${stripExt(file.name)}_cropped.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to crop PDF.')
    } finally {
      setBusy(false)
    }
  }

  const HANDLES: { corner: Corner; style: React.CSSProperties }[] = [
    { corner: 'nw', style: { left: 0, top: 0, cursor: 'nwse-resize', transform: 'translate(-50%,-50%)' } },
    { corner: 'ne', style: { right: 0, top: 0, cursor: 'nesw-resize', transform: 'translate(50%,-50%)' } },
    { corner: 'sw', style: { left: 0, bottom: 0, cursor: 'nesw-resize', transform: 'translate(-50%,50%)' } },
    { corner: 'se', style: { right: 0, bottom: 0, cursor: 'nwse-resize', transform: 'translate(50%,50%)' } },
  ]

  return (
    <ToolShell title="CROP PDF" subtitle="Drag the box to crop every page">
      <div className="px-3 pt-3 space-y-3">
        {!file && <FileDrop accept="application/pdf" onFiles={(f) => resetForNewFile(f[0])} />}

        {file && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 truncate">{file.name}{thumbs.length > 0 ? ` · ${thumbs.length} page${thumbs.length === 1 ? '' : 's'}` : ''}</span>
            <button className="text-xs font-semibold" style={{ color: 'var(--purple)' }} onClick={() => resetForNewFile(null)}>
              Change file
            </button>
          </div>
        )}

        {(error || thumbError) && <p className="text-xs" style={{ color: '#dc2626' }}>{error || thumbError}</p>}
        {thumbsLoading && <p className="text-xs text-gray-500">Loading pages…</p>}

        {thumbs.length > 1 && (
          <div>
            <p className="field-label">Page to preview</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {thumbs.map((t) => (
                <button
                  key={t.index}
                  onClick={() => setSelectedPage(t.index)}
                  className="relative flex-shrink-0"
                  style={{
                    width: 56, aspectRatio: '3/4', borderRadius: 4, overflow: 'hidden',
                    border: selectedPage === t.index ? '2px solid var(--purple)' : '1px solid #e5e7eb',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.dataUrl} alt={`Page ${t.index + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0.5 left-0.5 text-[10px] font-bold text-white px-1 rounded" style={{ background: 'rgba(0,0,0,0.55)' }}>
                    {t.index + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {preview && (
          <div
            ref={previewRef}
            className="relative bg-gray-50 border border-gray-200"
            style={{ width: '100%', touchAction: 'none', borderRadius: 4, overflow: 'hidden' }}
            onPointerMove={onContainerPointerMove}
            onPointerUp={onContainerPointerUp}
            onPointerLeave={onContainerPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.dataUrl} alt={`Page ${selectedPage + 1}`} className="w-full block" draggable={false} />
            <div
              onPointerDown={onBoxPointerDown}
              style={{
                position: 'absolute',
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.w * 100}%`,
                height: `${box.h * 100}%`,
                border: '1.5px solid var(--purple)',
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
                cursor: 'move',
                touchAction: 'none',
              }}
            >
              {HANDLES.map((h) => (
                <div
                  key={h.corner}
                  onPointerDown={(e) => onHandlePointerDown(e, h.corner)}
                  style={{
                    position: 'absolute', width: 22, height: 22, borderRadius: '50%',
                    background: 'var(--purple)', border: '2px solid #fff', touchAction: 'none',
                    ...h.style,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {file && (
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
            <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} style={{ width: 16, height: 16 }} />
            Apply this crop to all pages
          </label>
        )}

        {file && (
          <button
            onClick={handleCrop}
            disabled={busy || !preview}
            className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
            style={{ background: 'var(--purple)', borderRadius: 4 }}
          >
            {busy ? 'Cropping…' : 'Crop PDF'}
          </button>
        )}
      </div>
    </ToolShell>
  )
}
