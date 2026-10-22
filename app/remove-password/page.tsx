'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { removePdfPassword, downloadBytes, stripExt } from '@/app/lib/engine'

export default function RemovePasswordPage() {
  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsPassword, setNeedsPassword] = useState(false)

  async function handleRun() {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const bytes = await file.arrayBuffer()
      const out = await removePdfPassword(bytes, password || undefined, 2, (page, total) =>
        setProgress(`Rendering page ${page} / ${total}…`)
      )
      setNeedsPassword(false)
      downloadBytes(out, `${stripExt(file.name)}_unlocked.pdf`)
    } catch (e) {
      const message = (e as Error).message || 'Failed to remove the password.'
      setError(message)
      if (message.includes('password')) setNeedsPassword(true)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <ToolShell title="REMOVE PDF PASSWORD" subtitle="Unlock a password-protected PDF so it opens without one">
      <div className="px-3 pt-3 space-y-3">
        {!file && <FileDrop accept="application/pdf" onFiles={(f) => setFile(f[0])} />}

        {file && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 truncate">{file.name}</span>
            <button
              className="text-xs font-semibold flex-shrink-0 ml-2"
              style={{ color: 'var(--purple)' }}
              onClick={() => {
                setFile(null)
                setPassword('')
                setError(null)
                setNeedsPassword(false)
              }}
            >
              Change file
            </button>
          </div>
        )}

        {file && (
          <>
            <div>
              <p className="text-[13px] text-gray-500 mb-1">
                PDF password {needsPassword ? '(required)' : '(leave blank if you don’t know of one)'}
              </p>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoFocus={needsPassword}
                className="w-full px-3 py-2 text-sm border"
                style={{ borderColor: needsPassword ? '#dc2626' : '#e5e7eb', borderRadius: 4 }}
              />
            </div>

            <p className="text-[13px] text-gray-400">
              The output is rebuilt page-by-page as images, so it opens without any password — but the text is no
              longer selectable or searchable.
            </p>

            {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

            <button
              onClick={handleRun}
              disabled={busy}
              className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              {busy ? (progress || 'Removing password…') : 'Remove password'}
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
