'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { addTextWatermark, downloadBytes, stripExt } from '@/app/lib/engine'

const PRESETS = ['CONFIDENTIAL', 'PC-TEAM 4 FOR INTERNAL USE ONLY', 'DRAFT']

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState('CONFIDENTIAL')
  const [opacity, setOpacity] = useState(0.22)
  const [size, setSize] = useState(48)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRun() {
    if (!file || !text.trim()) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const out = await addTextWatermark(bytes, text.trim(), { opacity, size })
      downloadBytes(out, `${stripExt(file.name)}_watermarked.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to add watermark.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="ADD WATERMARK" subtitle="Diagonal text watermark, bottom-left to top-right">
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
              <label className="field-label">Watermark text</label>
              <input className="app-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={60} />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setText(preset)}
                    className="text-[12px] font-semibold px-2 py-1"
                    style={{
                      border: `1px solid ${text === preset ? 'var(--purple)' : '#e5e7eb'}`,
                      color: text === preset ? 'var(--purple)' : '#666',
                      background: text === preset ? '#f3e8ff' : '#fff',
                      borderRadius: 12,
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[13px] text-gray-500 mb-1">Opacity: {Math.round(opacity * 100)}%</p>
              <input type="range" min={0.05} max={0.6} step={0.01} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full" />
            </div>

            <div>
              <p className="text-[13px] text-gray-500 mb-1">Size: {size}pt</p>
              <input type="range" min={20} max={90} step={2} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full" />
            </div>

            <button
              onClick={handleRun}
              disabled={busy || !text.trim()}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? 'Adding watermark…' : 'Add watermark'}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
