'use client'

import { useEffect, useRef, useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { usePdfThumbnails } from '@/app/lib/usePdfThumbnails'
import { loadPdfJsDocument, renderPageDataUrl } from '@/app/lib/pdfjs'
import { signPdf, downloadBytes, stripExt, type SignElement } from '@/app/lib/engine'

const COLORS = ['#000000', '#1D4ED8', '#DC2626']
const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const PREVIEW_SCALE = 1.4

type DateLang = 'th' | 'en'
type DateFormat = 'long' | 'short' | 'monthYear'

function toThaiDigits(s: string): string {
  const map: Record<string, string> = { '0': '๐', '1': '๑', '2': '๒', '3': '๓', '4': '๔', '5': '๕', '6': '๖', '7': '๗', '8': '๘', '9': '๙' }
  return s.replace(/[0-9]/g, (d) => map[d])
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDate(iso: string, lang: DateLang, format: DateFormat, thaiDigits: boolean): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''

  if (lang === 'th') {
    const buddhistYear = y + 543
    const s =
      format === 'long' ? `${d} ${THAI_MONTHS[m - 1]} พ.ศ. ${buddhistYear}`
      : format === 'monthYear' ? `${THAI_MONTHS[m - 1]} พ.ศ. ${buddhistYear}`
      : `${pad2(d)}/${pad2(m)}/${buddhistYear}`
    return thaiDigits ? toThaiDigits(s) : s
  }
  if (format === 'long') return `${ENGLISH_MONTHS[m - 1]} ${d}, ${y}`
  if (format === 'monthYear') return `${ENGLISH_MONTHS[m - 1]} ${y}`
  return `${pad2(d)}/${pad2(m)}/${y}`
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

let idCounter = 0
function nextId(): string {
  idCounter += 1
  return `el-${Date.now()}-${idCounter}`
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-[11px] font-semibold"
      style={{
        border: `1px solid ${active ? 'var(--purple)' : '#e5e7eb'}`,
        color: active ? 'var(--purple)' : '#666',
        background: active ? '#f3e8ff' : '#fff',
        borderRadius: 4,
      }}
    >
      {children}
    </button>
  )
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {COLORS.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-label={c}
          style={{
            width: 22, height: 22, borderRadius: '50%', background: c,
            border: value.toLowerCase() === c.toLowerCase() ? '2px solid var(--purple)' : '1px solid #e5e7eb',
          }}
        />
      ))}
    </div>
  )
}

export default function SignPage() {
  const [file, setFile] = useState<File | null>(null)
  const { thumbs, loading: thumbsLoading, error: thumbError } = usePdfThumbnails(file, 0.3)
  const [selectedPage, setSelectedPage] = useState(0)
  const [preview, setPreview] = useState<{ dataUrl: string; width: number; height: number } | null>(null)
  const [elements, setElements] = useState<SignElement[]>([])
  const [selectedElId, setSelectedElId] = useState<string | null>(null)
  // null = "just the page I'm looking at" (tracks selectedPage automatically);
  // an explicit array = a fixed set of pages the next Add applies to.
  const [targetPages, setTargetPages] = useState<number[] | null>(null)

  const [tab, setTab] = useState<'draw' | 'upload' | 'type'>('draw')
  const [sigColor, setSigColor] = useState(COLORS[0])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const [hasDrawing, setHasDrawing] = useState(false)
  const [typedName, setTypedName] = useState('')

  const [nameText, setNameText] = useState('')
  const [nameColor, setNameColor] = useState(COLORS[0])
  const [dateISO, setDateISO] = useState(todayISO())
  const [dateColor, setDateColor] = useState(COLORS[0])
  const [dateLang, setDateLang] = useState<DateLang>('th')
  const [dateFormat, setDateFormat] = useState<DateFormat>('long')
  const [thaiDigits, setThaiDigits] = useState(true)

  const previewRef = useRef<HTMLDivElement>(null)
  const [renderedWidth, setRenderedWidth] = useState(0)
  const dragState = useRef<{ id: string; offsetXPct: number; offsetYPct: number } | null>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Render the currently selected page at a higher resolution for the live
  // drag-to-position editor (the thumbnail strip stays at its own low scale).
  useEffect(() => {
    let cancelled = false
    // resetForNewFile() already clears `preview` synchronously when the
    // file changes — nothing to do here for the no-file case.
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

  useEffect(() => {
    const el = previewRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => setRenderedWidth(entries[0].contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [preview])

  function resetForNewFile(f: File | null) {
    setFile(f)
    setElements([])
    setSelectedElId(null)
    setSelectedPage(0)
    setPreview(null)
    setError(null)
  }

  // ── Canvas drawing (signature tab) ──────────────────────────────────
  function canvasPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) }
  }
  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = canvasPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }
  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.strokeStyle = sigColor
    const { x, y } = canvasPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasDrawing(true)
  }
  function endDraw() {
    drawingRef.current = false
  }
  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawing(false)
  }

  function effectiveTargetPages(): number[] {
    return targetPages === null ? [selectedPage] : targetPages
  }

  function togglePageTarget(idx: number) {
    setTargetPages((prev) => {
      const base = new Set(prev === null ? [selectedPage] : prev)
      if (base.has(idx)) base.delete(idx)
      else base.add(idx)
      const arr = Array.from(base).sort((a, b) => a - b)
      return arr.length === 0 ? [selectedPage] : arr
    })
  }

  /** Selects the new element on the page currently being viewed, if there
   * is one, so it's immediately visible without switching pages. */
  function selectAfterAdd(newEls: SignElement[]) {
    const onCurrent = newEls.find((e) => e.pageIndex === selectedPage)
    setSelectedElId((onCurrent ?? newEls[newEls.length - 1])?.id ?? null)
  }

  function addImageElement(dataUrl: string, aspect: number) {
    const newEls = effectiveTargetPages().map((pageIndex): SignElement => ({
      id: nextId(), kind: 'image', pageIndex,
      xPct: 0.35, yPct: 0.4, widthPct: 0.3, aspect, dataUrl,
    }))
    setElements((prev) => [...prev, ...newEls])
    selectAfterAdd(newEls)
  }

  function addFromDrawing() {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawing) return
    addImageElement(canvas.toDataURL('image/png'), canvas.height / canvas.width)
    clearCanvas()
  }

  async function addFromUpload(f: File) {
    setError(null)
    try {
      const bitmap = await createImageBitmap(f)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      // Treat near-white pixels as transparent so a signature photographed
      // or scanned on white paper drops onto the page cleanly.
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d = imgData.data
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) d[i + 3] = 0
      }
      ctx.putImageData(imgData, 0, 0)
      addImageElement(canvas.toDataURL('image/png'), canvas.height / canvas.width)
    } catch (e) {
      setError((e as Error).message || 'Failed to load image.')
    }
  }

  async function addFromTyped() {
    if (!typedName.trim()) return
    setError(null)
    try {
      // next/font exposes --font-signature as a quoted family plus a
      // synthetic metrics-only fallback (`"Charmonman", "Charmonman
      // Fallback"`) — passing that whole list to document.fonts.load()
      // throws a NetworkError in Chromium, so only the real family name
      // (the first token) gets requested here.
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--font-signature').trim()
      const family = (raw.split(',')[0].trim().replace(/^["']|["']$/g, '')) || 'cursive'
      const size = 72
      const font = `700 ${size}px "${family}"`
      await document.fonts.load(font)
      const measure = document.createElement('canvas').getContext('2d')!
      measure.font = font
      const textWidth = measure.measureText(typedName).width
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(textWidth) + 24
      canvas.height = Math.ceil(size * 1.5)
      const ctx = canvas.getContext('2d')!
      ctx.font = font
      ctx.fillStyle = sigColor
      ctx.textBaseline = 'middle'
      ctx.fillText(typedName, 12, canvas.height / 2)
      addImageElement(canvas.toDataURL('image/png'), canvas.height / canvas.width)
    } catch (e) {
      setError((e as Error).message || 'Failed to render the typed signature.')
    }
  }

  function addNameStamp() {
    if (!nameText.trim()) return
    const newEls = effectiveTargetPages().map((pageIndex): SignElement => ({
      id: nextId(), kind: 'text', pageIndex,
      xPct: 0.1, yPct: 0.85, text: nameText.trim(), color: nameColor, sizePt: 14,
    }))
    setElements((prev) => [...prev, ...newEls])
    selectAfterAdd(newEls)
  }

  function addDateStamp() {
    const label = formatDate(dateISO, dateLang, dateFormat, thaiDigits)
    if (!label) return
    const newEls = effectiveTargetPages().map((pageIndex): SignElement => ({
      id: nextId(), kind: 'text', pageIndex,
      xPct: 0.1, yPct: 0.9, text: label, color: dateColor, sizePt: 14,
    }))
    setElements((prev) => [...prev, ...newEls])
    selectAfterAdd(newEls)
  }

  function updateElement(id: string, patch: Partial<SignElement>) {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, ...patch } as SignElement : el)))
  }
  function removeElement(id: string) {
    setElements((prev) => prev.filter((el) => el.id !== id))
    if (selectedElId === id) setSelectedElId(null)
  }
  function centerElement(id: string) {
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, xPct: el.kind === 'image' ? 0.5 - el.widthPct / 2 : 0.35, yPct: 0.45 } : el)))
  }

  // ── Drag-to-position on the live preview ────────────────────────────
  function onElPointerDown(e: React.PointerEvent, id: string) {
    e.stopPropagation()
    setSelectedElId(id)
    const rect = previewRef.current!.getBoundingClientRect()
    const el = elements.find((x) => x.id === id)!
    dragState.current = {
      id,
      offsetXPct: (e.clientX - rect.left) / rect.width - el.xPct,
      offsetYPct: (e.clientY - rect.top) / rect.height - el.yPct,
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  function onContainerPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return
    const rect = previewRef.current!.getBoundingClientRect()
    const { id, offsetXPct, offsetYPct } = dragState.current
    const xPct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width - offsetXPct))
    const yPct = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height - offsetYPct))
    setElements((prev) => prev.map((el) => (el.id === id ? { ...el, xPct, yPct } : el)))
  }
  function onContainerPointerUp() {
    dragState.current = null
  }

  const pageWidthPts = preview ? preview.width / PREVIEW_SCALE : 0
  const ptToPx = pageWidthPts > 0 && renderedWidth > 0 ? renderedWidth / pageWidthPts : 1

  const elementsOnPage = new Map<number, number>()
  for (const el of elements) elementsOnPage.set(el.pageIndex, (elementsOnPage.get(el.pageIndex) ?? 0) + 1)
  const pagesUsed = new Set(elements.map((el) => el.pageIndex)).size

  async function handleSave() {
    if (!file || elements.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const out = await signPdf(bytes, elements)
      downloadBytes(out, `${stripExt(file.name)}_signed.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to save PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="SIGN PDF" subtitle="Draw, upload, or type a signature, then place it on the page">
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

        {thumbs.length > 0 && (
          <>
            <div>
              <p className="field-label">Page to sign</p>
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
                    {(elementsOnPage.get(t.index) ?? 0) > 0 && (
                      <span className="absolute top-0.5 right-0.5 text-[10px] font-bold text-white rounded-full flex items-center justify-center" style={{ width: 16, height: 16, background: '#16a34a' }}>
                        {elementsOnPage.get(t.index)}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div
              ref={previewRef}
              className="relative bg-gray-50 border border-gray-200"
              style={{ width: '100%', touchAction: 'none', borderRadius: 4, overflow: 'hidden' }}
              onPointerMove={onContainerPointerMove}
              onPointerUp={onContainerPointerUp}
              onPointerLeave={onContainerPointerUp}
            >
              {preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview.dataUrl} alt={`Page ${selectedPage + 1}`} className="w-full block" draggable={false} />
              )}
              {elements.filter((el) => el.pageIndex === selectedPage).map((el) => (
                <div
                  key={el.id}
                  onPointerDown={(e) => onElPointerDown(e, el.id)}
                  style={{
                    position: 'absolute',
                    left: `${el.xPct * 100}%`,
                    top: `${el.yPct * 100}%`,
                    width: el.kind === 'image' ? `${el.widthPct * 100}%` : 'auto',
                    cursor: 'grab',
                    userSelect: 'none',
                    border: selectedElId === el.id ? '1.5px dashed var(--purple)' : '1.5px dashed transparent',
                    padding: 1,
                  }}
                >
                  {el.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={el.dataUrl} alt="" className="w-full block" style={{ pointerEvents: 'none' }} draggable={false} />
                  ) : (
                    <span style={{ color: el.color, fontSize: `${Math.max(8, el.sizePt * ptToPx)}px`, whiteSpace: 'nowrap', pointerEvents: 'none', fontWeight: 600 }}>
                      {el.text}
                    </span>
                  )}
                  {selectedElId === el.id && (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeElement(el.id)
                      }}
                      aria-label="Remove"
                      className="flex items-center justify-center text-white font-bold"
                      style={{
                        position: 'absolute',
                        left: -9,
                        top: -9,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'rgba(220,38,38,0.9)',
                        fontSize: 11,
                        lineHeight: 1,
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="border border-gray-200 p-3 space-y-2" style={{ borderRadius: 4 }}>
              <div className="flex items-center justify-between">
                <p className="field-label mb-0">Apply to pages</p>
                <div className="flex gap-2">
                  <button onClick={() => setTargetPages(null)} className="text-[11px] font-semibold" style={{ color: 'var(--purple)' }}>
                    This page
                  </button>
                  <button onClick={() => setTargetPages(thumbs.map((t) => t.index))} className="text-[11px] font-bold" style={{ color: 'var(--purple)' }}>
                    All pages
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {thumbs.map((t) => {
                  const active = targetPages === null ? t.index === selectedPage : targetPages.includes(t.index)
                  return (
                    <button
                      key={t.index}
                      onClick={() => togglePageTarget(t.index)}
                      className="text-[11px] font-semibold flex items-center justify-center"
                      style={{
                        width: 26, height: 26, borderRadius: 4,
                        border: `1px solid ${active ? 'var(--purple)' : '#e5e7eb'}`,
                        background: active ? '#f3e8ff' : '#fff',
                        color: active ? 'var(--purple)' : '#666',
                      }}
                    >
                      {t.index + 1}
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-gray-400">
                {targetPages === null
                  ? `Signatures and stamps you add now go on page ${selectedPage + 1} only.`
                  : targetPages.length === thumbs.length
                    ? 'Signatures and stamps you add now go on every page.'
                    : `Signatures and stamps you add now go on ${targetPages.length} page${targetPages.length === 1 ? '' : 's'} (${targetPages.map((p) => p + 1).join(', ')}).`}
              </p>
            </div>

            <div className="border border-gray-200 p-3" style={{ borderRadius: 4 }}>
              <p className="field-label mb-1.5">Create signature</p>
              <div className="grid grid-cols-3 gap-1.5 mb-2">
                {(['draw', 'upload', 'type'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className="py-1.5 text-xs font-semibold"
                    style={{
                      border: `1px solid ${tab === t ? 'var(--purple)' : '#e5e7eb'}`,
                      color: tab === t ? 'var(--purple)' : '#666',
                      background: tab === t ? '#f3e8ff' : '#fff',
                      borderRadius: 4,
                    }}
                  >
                    {t === 'draw' ? 'Draw' : t === 'upload' ? 'Upload' : 'Type'}
                  </button>
                ))}
              </div>

              {tab === 'draw' && (
                <div className="space-y-2">
                  <ColorSwatches value={sigColor} onChange={setSigColor} />
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={180}
                    className="w-full bg-white border border-gray-200"
                    style={{ borderRadius: 4, touchAction: 'none', aspectRatio: '500/180' }}
                    onPointerDown={startDraw}
                    onPointerMove={moveDraw}
                    onPointerUp={endDraw}
                    onPointerLeave={endDraw}
                  />
                  <div className="flex gap-2">
                    <button onClick={clearCanvas} className="flex-1 py-2 text-xs font-semibold border border-gray-200" style={{ borderRadius: 4, color: '#666' }}>
                      Clear
                    </button>
                    <button
                      onClick={addFromDrawing}
                      disabled={!hasDrawing}
                      className="flex-1 py-2 text-xs font-bold text-white disabled:opacity-40"
                      style={{ background: 'var(--purple)', borderRadius: 4 }}
                    >
                      Add to page
                    </button>
                  </div>
                </div>
              )}

              {tab === 'upload' && (
                <div className="space-y-2">
                  <FileDrop accept="image/*" label="Drag a signature photo, or tap to choose" onFiles={(f) => addFromUpload(f[0])} />
                  <p className="text-[11px] text-gray-400">White background is removed automatically.</p>
                </div>
              )}

              {tab === 'type' && (
                <div className="space-y-2">
                  <input
                    className="app-input"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="e.g. Penguin Bindai"
                    maxLength={60}
                  />
                  <ColorSwatches value={sigColor} onChange={setSigColor} />
                  {typedName.trim() && (
                    <p style={{ fontFamily: 'var(--font-signature)', fontSize: 32, color: sigColor }}>{typedName}</p>
                  )}
                  <button
                    onClick={addFromTyped}
                    disabled={!typedName.trim()}
                    className="w-full py-2 text-xs font-bold text-white disabled:opacity-40"
                    style={{ background: 'var(--purple)', borderRadius: 4 }}
                  >
                    Add to page
                  </button>
                </div>
              )}
            </div>

            <div className="border border-gray-200 p-3 space-y-3" style={{ borderRadius: 4 }}>
              <p className="field-label">Add name / date (optional)</p>

              <div className="flex gap-2 items-center">
                <input className="app-input" value={nameText} onChange={(e) => setNameText(e.target.value)} placeholder="e.g. Penguin Bindai" maxLength={80} />
                <button onClick={addNameStamp} disabled={!nameText.trim()} className="flex-shrink-0 px-3 py-2 text-xs font-bold text-white disabled:opacity-40" style={{ background: 'var(--purple)', borderRadius: 4 }}>
                  + Name
                </button>
              </div>
              <ColorSwatches value={nameColor} onChange={setNameColor} />

              <div className="flex gap-2 items-center">
                <input type="date" className="app-input" value={dateISO} onChange={(e) => setDateISO(e.target.value)} />
                <button onClick={addDateStamp} className="flex-shrink-0 px-3 py-2 text-xs font-bold text-white" style={{ background: 'var(--purple)', borderRadius: 4 }}>
                  + Date
                </button>
              </div>
              <p className="text-[11px] text-gray-500">{formatDate(dateISO, dateLang, dateFormat, thaiDigits)}</p>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1.5">
                  <PillButton active={dateLang === 'th'} onClick={() => setDateLang('th')}>ไทย</PillButton>
                  <PillButton active={dateLang === 'en'} onClick={() => setDateLang('en')}>English</PillButton>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <PillButton active={dateFormat === 'long'} onClick={() => setDateFormat('long')}>
                    {dateLang === 'th' ? '12 กันยายน 2569' : 'September 12, 2026'}
                  </PillButton>
                  <PillButton active={dateFormat === 'short'} onClick={() => setDateFormat('short')}>
                    {dateLang === 'th' ? '12/09/2569' : '12/09/2026'}
                  </PillButton>
                  <PillButton active={dateFormat === 'monthYear'} onClick={() => setDateFormat('monthYear')}>
                    {dateLang === 'th' ? 'กันยายน 2569' : 'September 2026'}
                  </PillButton>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {dateLang === 'th' && (
                  <div className="flex gap-1.5">
                    <PillButton active={thaiDigits} onClick={() => setThaiDigits(true)}>Thai digits</PillButton>
                    <PillButton active={!thaiDigits} onClick={() => setThaiDigits(false)}>Arabic digits</PillButton>
                  </div>
                )}
                <ColorSwatches value={dateColor} onChange={setDateColor} />
              </div>
            </div>

            {elements.length > 0 && (
              <div className="space-y-2">
                <p className="field-label">Placed items</p>
                {elements.map((el, i) => (
                  <div key={el.id} className="border p-2 space-y-1.5" style={{ borderRadius: 4, borderColor: selectedElId === el.id ? 'var(--purple)' : '#e5e7eb' }}>
                    <div className="flex items-center justify-between">
                      <button className="text-xs font-semibold text-left" onClick={() => { setSelectedPage(el.pageIndex); setSelectedElId(el.id) }}>
                        {el.kind === 'image' ? `Signature ${i + 1}` : `Text: "${el.text}"`} — page {el.pageIndex + 1}
                      </button>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => centerElement(el.id)} className="text-[11px] font-semibold" style={{ color: 'var(--purple)' }}>Center</button>
                        <button onClick={() => removeElement(el.id)} className="text-[11px] font-semibold text-red-500">Remove</button>
                      </div>
                    </div>
                    {el.kind === 'image' ? (
                      <input
                        type="range" min={0.1} max={0.7} step={0.02} value={el.widthPct}
                        onChange={(e) => updateElement(el.id, { widthPct: Number(e.target.value) })}
                        className="w-full"
                      />
                    ) : (
                      <input
                        type="range" min={8} max={36} step={1} value={el.sizePt}
                        onChange={(e) => updateElement(el.id, { sizePt: Number(e.target.value) })}
                        className="w-full"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            <p className="text-[13px] text-gray-500">Placed {elements.length} item{elements.length === 1 ? '' : 's'} across {pagesUsed} page{pagesUsed === 1 ? '' : 's'}</p>

            <button
              onClick={handleSave}
              disabled={busy || elements.length === 0}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? 'Saving…' : 'Save signed PDF'}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
