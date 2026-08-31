'use client'

import { useState } from 'react'
import JSZip from 'jszip'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { compressImageFile, downloadBlob, stripExt } from '@/app/lib/engine'

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function CompressImagesPage() {
  const [files, setFiles] = useState<File[]>([])
  const [quality, setQuality] = useState(0.7)
  const [maxDimension, setMaxDimension] = useState<number | undefined>(1920)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ before: number; after: number } | null>(null)

  function addFiles(newFiles: File[]) {
    setError(null)
    setResult(null)
    setFiles((prev) => [...prev, ...newFiles])
  }

  async function handleRun() {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      let before = 0
      let after = 0
      if (files.length === 1) {
        const f = files[0]
        const { blob } = await compressImageFile(f, { quality, maxDimension })
        before = f.size
        after = blob.size
        const ext = blob.type === 'image/png' ? 'png' : 'jpg'
        downloadBlob(blob, `${stripExt(f.name)}_compressed.${ext}`)
      } else {
        const zip = new JSZip()
        for (let i = 0; i < files.length; i++) {
          const f = files[i]
          setProgress(`Compressing ${i + 1} / ${files.length}…`)
          const { blob } = await compressImageFile(f, { quality, maxDimension })
          before += f.size
          after += blob.size
          const ext = blob.type === 'image/png' ? 'png' : 'jpg'
          zip.file(`${stripExt(f.name)}_compressed.${ext}`, blob)
        }
        setProgress('Zipping…')
        const zipBlob = await zip.generateAsync({ type: 'blob' })
        downloadBlob(zipBlob, `compressed_images_${files.length}.zip`)
      }
      setResult({ before, after })
    } catch (e) {
      setError((e as Error).message || 'Failed to compress images.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <ToolShell title="COMPRESS IMAGES" subtitle="Shrink JPG / PNG / WebP file size">
      <div className="px-3 pt-3 space-y-3">
        <FileDrop accept="image/*" multiple label="Tap to choose images, or drag & drop" onFiles={addFiles} />

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
              <p className="text-[11px] text-gray-500 mb-1">Quality: {Math.round(quality * 100)}% (PNGs stay lossless)</p>
              <input type="range" min={0.3} max={0.95} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
            </div>

            <div>
              <p className="text-[11px] text-gray-500 mb-1">Max dimension</p>
              <div className="grid grid-cols-4 gap-2">
                {[{ label: 'Original', v: undefined }, { label: '2000px', v: 2000 }, { label: '1600px', v: 1600 }, { label: '1200px', v: 1200 }].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setMaxDimension(opt.v)}
                    className="py-2 font-bold text-[10px]"
                    style={{
                      border: `2px solid ${maxDimension === opt.v ? 'var(--purple)' : '#e5e7eb'}`,
                      color: maxDimension === opt.v ? 'var(--purple)' : '#666',
                      background: maxDimension === opt.v ? '#f3e8ff' : '#fff',
                      borderRadius: 4,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {result && (
              <p className="text-xs font-semibold" style={{ color: '#16a34a' }}>
                {fmtSize(result.before)} → {fmtSize(result.after)} ({Math.round((1 - result.after / result.before) * 100)}% smaller)
              </p>
            )}

            <button
              onClick={handleRun}
              disabled={busy}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? (progress || 'Compressing…') : `Compress ${files.length} image${files.length === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
