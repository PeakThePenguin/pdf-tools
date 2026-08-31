'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import ImagePickerGrid from '@/app/components/ImagePickerGrid'
import { imagesToPdf, downloadBytes } from '@/app/lib/engine'

export default function ImagesToPdfPage() {
  const [files, setFiles] = useState<File[]>([])
  const [fitToA4, setFitToA4] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addFiles(newFiles: File[]) {
    setError(null)
    setFiles((prev) => [...prev, ...newFiles])
  }

  async function handleRun() {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const out = await imagesToPdf(files, { fitToA4 })
      downloadBytes(out, `images_${files.length}.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to build PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="IMAGES → PDF" subtitle="Combine photos or scans into one PDF">
      <div className="px-3 pt-3 space-y-3">
        <FileDrop accept="image/*" multiple label="Tap to choose images, or drag & drop" onFiles={addFiles} />

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        <ImagePickerGrid files={files} onChange={setFiles} />

        {files.length > 0 && (
          <>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={fitToA4} onChange={(e) => setFitToA4(e.target.checked)} />
              Fit each image onto an A4 page (unchecked keeps each image&rsquo;s own size)
            </label>

            <button
              onClick={handleRun}
              disabled={busy}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? 'Building PDF…' : `Create PDF (${files.length} image${files.length === 1 ? '' : 's'})`}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
