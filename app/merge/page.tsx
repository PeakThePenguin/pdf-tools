'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { mergePdfs, downloadBytes, stripExt } from '@/app/lib/engine'

export default function MergePdfPage() {
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function addFiles(newFiles: File[]) {
    setError(null)
    setFiles((prev) => [...prev, ...newFiles])
  }

  function move(i: number, dir: -1 | 1) {
    setFiles((prev) => {
      const next = [...prev]
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function remove(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleMerge() {
    if (files.length < 2) { setError('Add at least 2 PDF files.'); return }
    setBusy(true)
    setError(null)
    try {
      const bytes = await mergePdfs(files)
      downloadBytes(bytes, `merged_${files.length}_files.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to merge PDFs.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="MERGE PDF" subtitle="Combine multiple PDFs into one">
      <div className="px-3 pt-3 space-y-3">
        <FileDrop accept="application/pdf" multiple label="Tap to choose PDF files, or drag & drop" onFiles={addFiles} />

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2 border border-gray-200 rounded px-2 py-1.5">
                <span className="text-xs font-bold text-gray-400 w-4 text-center">{i + 1}</span>
                <span className="flex-1 min-w-0 text-xs text-gray-800 truncate">{stripExt(f.name)}</span>
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-gray-500 disabled:opacity-30 px-1">↑</button>
                <button onClick={() => move(i, 1)} disabled={i === files.length - 1} className="text-gray-500 disabled:opacity-30 px-1">↓</button>
                <button onClick={() => remove(i)} className="text-red-500 px-1">✕</button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={handleMerge}
          disabled={busy || files.length < 2}
          className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
          style={{ background: 'var(--purple)', borderRadius: 4 }}
        >
          {busy ? 'Merging…' : `Merge ${files.length || ''} PDF${files.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </ToolShell>
  )
}
