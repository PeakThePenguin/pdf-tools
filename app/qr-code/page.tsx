'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import ToolShell from '@/app/components/ToolShell'
import { downloadBlob } from '@/app/lib/engine'

type ErrorLevel = 'L' | 'M' | 'Q' | 'H'

const ERROR_LEVELS: { value: ErrorLevel; label: string }[] = [
  { value: 'L', label: 'Low (~7%)' },
  { value: 'M', label: 'Medium (~15%)' },
  { value: 'Q', label: 'Quartile (~25%)' },
  { value: 'H', label: 'High (~30%)' },
]

export default function QrCodePage() {
  const [text, setText] = useState('')
  const [size, setSize] = useState(300)
  const [errorLevel, setErrorLevel] = useState<ErrorLevel>('M')
  const [fgColor, setFgColor] = useState('#000000')
  const [bgColor, setBgColor] = useState('#ffffff')
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const trimmed = text.trim()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!trimmed) {
      canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }
    QRCode.toCanvas(canvas, trimmed, {
      width: size,
      margin: 3,
      errorCorrectionLevel: errorLevel,
      color: { dark: fgColor, light: bgColor },
    })
      .then(() => setError(null))
      .catch((e: Error) => setError(e.message || 'Failed to generate QR code.'))
  }, [trimmed, size, errorLevel, fgColor, bgColor])

  async function handleDownloadPng() {
    if (!trimmed) return
    const dataUrl = await QRCode.toDataURL(trimmed, { width: size, margin: 3, errorCorrectionLevel: errorLevel, color: { dark: fgColor, light: bgColor } })
    const blob = await (await fetch(dataUrl)).blob()
    downloadBlob(blob, 'qrcode.png')
  }

  async function handleDownloadSvg() {
    if (!trimmed) return
    const svg = await QRCode.toString(trimmed, { type: 'svg', margin: 3, errorCorrectionLevel: errorLevel, color: { dark: fgColor, light: bgColor } })
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'qrcode.svg')
  }

  return (
    <ToolShell title="QR CODE" subtitle="Create a QR code from text or a link">
      <div className="px-3 pt-3 space-y-3">
        <div>
          <label className="field-label">Text or URL</label>
          <textarea
            className="app-input"
            style={{ minHeight: 80, resize: 'vertical' }}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null) }}
            placeholder="https://example.com"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="field-label">Size (px)</label>
            <input
              type="number"
              min={100}
              max={1000}
              step={10}
              className="app-input"
              value={size}
              onChange={(e) => setSize(Math.min(1000, Math.max(100, Number(e.target.value) || 300)))}
            />
          </div>
          <div>
            <label className="field-label">Error correction</label>
            <select className="app-input" value={errorLevel} onChange={(e) => setErrorLevel(e.target.value as ErrorLevel)}>
              {ERROR_LEVELS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="field-label">Foreground</label>
            <input type="color" className="app-input" style={{ padding: 2, height: 38 }} value={fgColor} onChange={(e) => setFgColor(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Background</label>
            <input type="color" className="app-input" style={{ padding: 2, height: 38 }} value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        <div
          className="flex items-center justify-center border border-gray-200 p-3"
          style={{ borderRadius: 4, background: trimmed ? undefined : '#fafafa', minHeight: 120 }}
        >
          {trimmed ? (
            <canvas ref={canvasRef} style={{ maxWidth: '100%', height: 'auto' }} />
          ) : (
            <p className="text-xs text-gray-400">Type something above to preview the QR code</p>
          )}
        </div>

        {trimmed && !error && (
          <div className="flex gap-2">
            <button
              onClick={handleDownloadPng}
              className="flex-1 py-3 font-bold text-sm text-white"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              Download PNG
            </button>
            <button
              onClick={handleDownloadSvg}
              className="flex-1 py-3 font-bold text-sm"
              style={{ border: '1px solid var(--purple)', color: 'var(--purple)', borderRadius: 4 }}
            >
              Download SVG
            </button>
          </div>
        )}
      </div>
    </ToolShell>
  )
}
