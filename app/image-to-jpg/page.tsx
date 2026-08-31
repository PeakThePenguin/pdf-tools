'use client'

import { useState } from 'react'
import JSZip from 'jszip'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { convertImageToJpeg } from '@/app/lib/imageConvert'
import { downloadBlob, stripExt } from '@/app/lib/engine'

const ACCEPT = [
  'image/*',
  '.tif', '.tiff',
  '.psd',
  '.heic', '.heif',
  '.cr2', '.cr3', '.nef', '.arw', '.dng', '.orf', '.raf', '.rw2', '.pef', '.srw', '.raw',
].join(',')

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function ImageToJpgPage() {
  const [files, setFiles] = useState<File[]>([])
  const [quality, setQuality] = useState(0.92)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<string[]>([])

  function addFiles(newFiles: File[]) {
    setError(null)
    setNotes([])
    setFiles((prev) => [...prev, ...newFiles])
  }

  async function handleRun() {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    setNotes([])
    const failed: string[] = []
    const seenNotes = new Set<string>()
    try {
      if (files.length === 1) {
        const f = files[0]
        const { blob, note } = await convertImageToJpeg(f, quality)
        if (note) seenNotes.add(note)
        downloadBlob(blob, `${stripExt(f.name)}.jpg`)
      } else {
        const zip = new JSZip()
        for (let i = 0; i < files.length; i++) {
          const f = files[i]
          setProgress(`Converting ${i + 1} / ${files.length}…`)
          try {
            const { blob, note } = await convertImageToJpeg(f, quality)
            if (note) seenNotes.add(note)
            zip.file(`${stripExt(f.name)}.jpg`, blob)
          } catch (e) {
            failed.push(`${f.name}: ${(e as Error).message || 'conversion failed'}`)
          }
        }
        if (Object.keys(zip.files).length === 0) throw new Error('None of these files could be converted.')
        setProgress('Zipping…')
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        downloadBlob(zipBlob, `converted_jpg_${files.length}.zip`)
      }
      setNotes([...seenNotes, ...failed])
    } catch (e) {
      setError((e as Error).message || 'Failed to convert images.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <ToolShell title="IMAGE TO JPG" subtitle="Convert PNG, GIF, TIFF, PSD, SVG, WebP, HEIC & RAW to JPG">
      <div className="px-3 pt-3 space-y-3">
        <FileDrop accept={ACCEPT} multiple label="Tap to choose images, or drag & drop" onFiles={addFiles} />

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {files.length > 0 && (
          <div className="space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-gray-700 border-b border-gray-100 py-1">
                <span className="truncate flex-1 min-w-0">{f.name}</span>
                <span className="text-gray-400 ml-2 flex-shrink-0">{fmtSize(f.size)}</span>
                <button onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="text-red-500 ml-2 flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
        )}

        {files.length > 0 && (
          <>
            <div>
              <p className="text-[11px] text-gray-500 mb-1">JPG quality: {Math.round(quality * 100)}%</p>
              <input type="range" min={0.5} max={1} step={0.02} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
            </div>

            <p className="text-[11px] text-gray-400">
              GIFs convert their first frame only. PSDs use the flattened composite (no layers). RAW files use their embedded camera preview, not a full RAW develop.
            </p>

            {notes.length > 0 && (
              <div className="space-y-0.5">
                {notes.map((n, i) => (
                  <p key={i} className="text-[11px]" style={{ color: n.includes('failed') || n.includes(':') ? '#dc2626' : '#6b7280' }}>{n}</p>
                ))}
              </div>
            )}

            <button
              onClick={handleRun}
              disabled={busy}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? (progress || 'Converting…') : `Convert ${files.length} image${files.length === 1 ? '' : 's'} to JPG`}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
