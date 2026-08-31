'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { removeMetadata, downloadBytes, stripExt } from '@/app/lib/engine'

export default function RemoveMetadataPage() {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const out = await removeMetadata(bytes)
      downloadBytes(out, `${stripExt(file.name)}_clean.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to remove metadata.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="REMOVE METADATA" subtitle="Strip title, author, and other hidden info">
      <div className="px-3 pt-3 space-y-3">
        {!file && <FileDrop accept="application/pdf" onFiles={(f) => setFile(f[0])} />}

        {file && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 truncate">{file.name}</span>
            <button className="text-xs font-semibold" style={{ color: 'var(--purple)' }} onClick={() => setFile(null)}>
              Change file
            </button>
          </div>
        )}

        <p className="text-[13px] text-gray-500">Clears the title, author, subject, keywords, creator, and producer fields stored in the PDF.</p>

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {file && (
          <button
            onClick={handleRun}
            disabled={busy}
            className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
            style={{ background: 'var(--purple)', borderRadius: 4 }}
          >
            {busy ? 'Cleaning…' : 'Remove metadata'}
          </button>
        )}
      </div>
    </ToolShell>
  )
}
