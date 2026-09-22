'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { downloadBlob } from '@/app/lib/engine'
import { parseRosterCalendarScreenshot, renderCalendarRosterToJpeg } from '@/app/lib/rosterCalendar'

export default function RosterCalendarToJpgPage() {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [baseName, setBaseName] = useState('roster')

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    setPreviewUrl(null)
    setBlob(null)
    setProgress('Starting…')
    try {
      const data = await parseRosterCalendarScreenshot(file, (message) => setProgress(message))
      const jpgBlob = await renderCalendarRosterToJpeg(data)
      setBlob(jpgBlob)
      setPreviewUrl(URL.createObjectURL(jpgBlob))
      setBaseName(file.name.replace(/\.[a-z0-9]+$/i, '') || 'roster')
    } catch (e) {
      setError((e as Error).message || 'Failed to read this screenshot.')
    } finally {
      setBusy(false)
    }
  }

  function handleDownload() {
    if (blob) downloadBlob(blob, `${baseName}.jpg`)
  }

  return (
    <ToolShell title="ROSTER CALENDAR TO JPG" subtitle="Turn a Roster app calendar screenshot into a daily-view image">
      <div className="px-3 pt-3 space-y-3">
        <FileDrop accept="image/*" label="Tap to choose your Roster calendar screenshot" onFiles={(files) => handleFile(files[0])} />

        <p className="text-xs text-gray-500">
          Works on the month-grid calendar view of the Roster app (day number, colored duty badge, time range). Reads the
          screenshot with on-device OCR — text recognition can occasionally misread a badge or time, so double-check the
          result against the original screenshot.
        </p>

        {busy && <p className="text-xs text-gray-500">{progress || 'Reading and converting…'}</p>}
        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {previewUrl && (
          <>
            <div className="border border-gray-200" style={{ borderRadius: 4, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Converted roster preview" style={{ width: '100%', display: 'block' }} />
            </div>
            <button
              onClick={handleDownload}
              className="w-full py-3 font-bold text-sm text-white"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              Download JPG
            </button>
          </>
        )}
      </div>
    </ToolShell>
  )
}
