'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { compressPdf, downloadBytes, stripExt } from '@/app/lib/engine'

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function CompressPdfPage() {
  const [file, setFile] = useState<File | null>(null)
  const [quality, setQuality] = useState(0.6)
  const [maxDimension, setMaxDimension] = useState<number | undefined>(1600)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ before: number; after: number; imagesCompressed: number; imagesSkipped: number } | null>(null)

  async function handleRun() {
    if (!file) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const bytes = await file.arrayBuffer()
      const res = await compressPdf(bytes, {
        quality,
        maxDimension,
        onProgress: (done, total) => setProgress(total > 0 ? `Recompressing image ${done} / ${total}…` : 'Reading PDF…'),
      })
      setResult({
        before: res.originalSize,
        after: res.compressedSize,
        imagesCompressed: res.imagesCompressed,
        imagesSkipped: res.imagesSkipped,
      })
      downloadBytes(res.bytes, `${stripExt(file.name)}_compressed.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to compress PDF.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <ToolShell title="COMPRESS PDF" subtitle="Shrink file size by recompressing embedded photos">
      <div className="px-3 pt-3 space-y-3">
        {!file && <FileDrop accept="application/pdf" onFiles={(f) => { setFile(f[0]); setResult(null) }} />}

        {file && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 truncate">{file.name} · {fmtSize(file.size)}</span>
            <button className="text-xs font-semibold" style={{ color: 'var(--purple)' }} onClick={() => { setFile(null); setResult(null) }}>
              Change file
            </button>
          </div>
        )}

        <p className="text-[13px] text-gray-500">
          Recompresses the JPEG photos embedded in the PDF (the usual cause of large files — scans, screenshots).
          Text and line art are untouched. PDFs made up of vector text with no photos won&rsquo;t shrink much.
        </p>

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {file && (
          <>
            <div>
              <p className="text-[13px] text-gray-500 mb-1">Quality: {Math.round(quality * 100)}%</p>
              <input type="range" min={0.3} max={0.9} step={0.05} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full" />
            </div>

            <div>
              <p className="text-[13px] text-gray-500 mb-1">Max image resolution</p>
              <div className="grid grid-cols-4 gap-2">
                {[{ label: 'Original', v: undefined }, { label: '2000px', v: 2000 }, { label: '1600px', v: 1600 }, { label: '1200px', v: 1200 }].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => setMaxDimension(opt.v)}
                    className="py-2 font-bold text-[12px]"
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
              <p className="text-xs font-semibold" style={{ color: result.after < result.before ? '#16a34a' : '#b45309' }}>
                {fmtSize(result.before)} → {fmtSize(result.after)}
                {result.after < result.before ? ` (${Math.round((1 - result.after / result.before) * 100)}% smaller)` : ' (no smaller — nothing safe to recompress)'}
                {' · '}{result.imagesCompressed} image{result.imagesCompressed === 1 ? '' : 's'} recompressed
                {result.imagesSkipped > 0 ? `, ${result.imagesSkipped} skipped` : ''}
              </p>
            )}

            <button
              onClick={handleRun}
              disabled={busy}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? (progress || 'Compressing…') : 'Compress PDF'}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
