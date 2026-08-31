'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { rotateAllPages, downloadBytes, stripExt } from '@/app/lib/engine'

export default function RotatePage() {
  const [file, setFile] = useState<File | null>(null)
  const [angle, setAngle] = useState(90)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRotate() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const out = await rotateAllPages(bytes, angle)
      downloadBytes(out, `${stripExt(file.name)}_rotated.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to rotate PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="ROTATE PDF" subtitle="Rotate every page">
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
            <div className="grid grid-cols-3 gap-2">
              {[90, 180, 270].map((a) => (
                <button
                  key={a}
                  onClick={() => setAngle(a)}
                  className="py-3 flex flex-col items-center gap-1 font-bold text-xs"
                  style={{
                    border: `2px solid ${angle === a ? 'var(--purple)' : '#e5e7eb'}`,
                    color: angle === a ? 'var(--purple)' : '#666',
                    borderRadius: 4,
                    background: angle === a ? '#f3e8ff' : '#fff',
                  }}
                >
                  <span style={{ fontSize: 22, transform: `rotate(${a}deg)`, display: 'inline-block' }}>↻</span>
                  {a}°
                </button>
              ))}
            </div>

            <button
              onClick={handleRotate}
              disabled={busy}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? 'Rotating…' : `Rotate ${angle}°`}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
