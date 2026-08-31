'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { addPageNumbers, downloadBytes, stripExt, type PageNumberPosition } from '@/app/lib/engine'

const POSITIONS: { value: PageNumberPosition; label: string }[] = [
  { value: 'bottom-left', label: 'Left' },
  { value: 'bottom-center', label: 'Center' },
  { value: 'bottom-right', label: 'Right' },
]

export default function PageNumbersPage() {
  const [file, setFile] = useState<File | null>(null)
  const [position, setPosition] = useState<PageNumberPosition>('bottom-center')
  const [startAt, setStartAt] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const out = await addPageNumbers(bytes, { position, startAt })
      downloadBytes(out, `${stripExt(file.name)}_numbered.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to add page numbers.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="ADD PAGE NUMBERS" subtitle="Number every page">
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
            <div>
              <p className="text-[13px] text-gray-500 mb-1">Position</p>
              <div className="grid grid-cols-3 gap-2">
                {POSITIONS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPosition(p.value)}
                    className="py-2 font-bold text-xs"
                    style={{
                      border: `2px solid ${position === p.value ? 'var(--purple)' : '#e5e7eb'}`,
                      color: position === p.value ? 'var(--purple)' : '#666',
                      background: position === p.value ? '#f3e8ff' : '#fff',
                      borderRadius: 4,
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="field-label">Start numbering at</label>
              <input
                type="number"
                min={0}
                className="app-input"
                value={startAt}
                onChange={(e) => setStartAt(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>

            <button
              onClick={handleRun}
              disabled={busy}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? 'Adding numbers…' : 'Add page numbers'}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
