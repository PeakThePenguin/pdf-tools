'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { nUpPdf, downloadBytes, stripExt } from '@/app/lib/engine'

const OPTIONS = [2, 4, 6, 9] as const

export default function NUpPage() {
  const [file, setFile] = useState<File | null>(null)
  const [n, setN] = useState<2 | 4 | 6 | 9>(4)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const out = await nUpPdf(bytes, n)
      downloadBytes(out, `${stripExt(file.name)}_${n}up.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to lay out pages.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="N-UP" subtitle="Multiple pages per sheet">
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
          <>
            <p className="text-[11px] text-gray-500">Pages per sheet</p>
            <div className="grid grid-cols-4 gap-2">
              {OPTIONS.map((opt) => (
                <button
                  key={opt}
                  onClick={() => setN(opt)}
                  className="py-3 font-bold text-sm"
                  style={{
                    border: `2px solid ${n === opt ? 'var(--purple)' : '#e5e7eb'}`,
                    color: n === opt ? 'var(--purple)' : '#666',
                    background: n === opt ? '#f3e8ff' : '#fff',
                    borderRadius: 4,
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>

            <button
              onClick={handleRun}
              disabled={busy}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? 'Building…' : `Create ${n}-up PDF`}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
