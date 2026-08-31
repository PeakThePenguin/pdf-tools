'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { reversePages, downloadBytes, stripExt } from '@/app/lib/engine'

export default function ReversePage() {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReverse() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const out = await reversePages(bytes)
      downloadBytes(out, `${stripExt(file.name)}_reversed.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to reverse PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="REVERSE PAGES" subtitle="Flip the page order end to end">
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

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {file && (
          <button
            onClick={handleReverse}
            disabled={busy}
            className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
            style={{ background: 'var(--purple)', borderRadius: 4 }}
          >
            {busy ? 'Reversing…' : 'Reverse page order'}
          </button>
        )}
      </div>
    </ToolShell>
  )
}
