'use client'

import { useRef, useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import ImagePickerGrid from '@/app/components/ImagePickerGrid'
import { imagesToPdf, downloadBytes } from '@/app/lib/engine'

export default function ScanPage() {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    setError(null)
    setFiles((prev) => [...prev, ...Array.from(list)])
  }

  async function handleRun() {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const out = await imagesToPdf(files, { fitToA4: true })
      downloadBytes(out, `scan_${files.length}_pages.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to build PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="SCAN DOCUMENT" subtitle="Capture pages with your camera">
      <div className="px-3 pt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => cameraRef.current?.click()}
            className="py-4 flex flex-col items-center gap-1 font-bold text-xs text-white"
            style={{ background: 'var(--purple)', borderRadius: 4 }}
          >
            <span style={{ fontSize: 18 }}>📷</span>
            Take photo
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="py-4 flex flex-col items-center gap-1 font-bold text-xs"
            style={{ background: '#fff', color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 4 }}
          >
            <span style={{ fontSize: 18 }}>🖼️</span>
            Choose from gallery
          </button>
        </div>

        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {files.length > 0 && (
          <p className="text-[11px] text-gray-500">{files.length} page{files.length === 1 ? '' : 's'} captured — reorder with ← →</p>
        )}

        <ImagePickerGrid files={files} onChange={setFiles} />

        {files.length > 0 && (
          <button
            onClick={handleRun}
            disabled={busy}
            className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
            style={{ background: 'var(--purple)', borderRadius: 4 }}
          >
            {busy ? 'Building PDF…' : `Save as PDF (${files.length} page${files.length === 1 ? '' : 's'})`}
          </button>
        )}
      </div>
    </ToolShell>
  )
}
