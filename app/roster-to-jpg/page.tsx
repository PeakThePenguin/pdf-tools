'use client'

import { useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import FileDrop from '@/app/components/FileDrop'
import { downloadBlob } from '@/app/lib/engine'
import { parseCrewScheduleSlip, renderRosterToJpeg, rosterToIcs } from '@/app/lib/roster'

export default function RosterToJpgPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [ics, setIcs] = useState<string | null>(null)
  const [baseName, setBaseName] = useState('roster')

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    setPreviewUrl(null)
    setBlob(null)
    setIcs(null)
    try {
      const bytes = await file.arrayBuffer()
      const roster = await parseCrewScheduleSlip(bytes)
      const jpgBlob = await renderRosterToJpeg(roster)
      setBlob(jpgBlob)
      setPreviewUrl(URL.createObjectURL(jpgBlob))
      setIcs(rosterToIcs(roster) || null)
      setBaseName(file.name.replace(/\.pdf$/i, '') || 'roster')
    } catch (e) {
      setError((e as Error).message || 'Failed to convert this PDF.')
    } finally {
      setBusy(false)
    }
  }

  function handleDownloadJpg() {
    if (blob) downloadBlob(blob, `${baseName}.jpg`)
  }
  function handleDownloadIcs() {
    if (ics) downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), `${baseName}.ics`)
  }

  return (
    <ToolShell title="ROSTER TO JPG" subtitle="Turn a Crew Schedule Slip into a daily-view image">
      <div className="px-3 pt-3 space-y-3">
        <FileDrop accept="application/pdf" label="Tap to choose your Crew Schedule Slip PDF" onFiles={(files) => handleFile(files[0])} />

        {busy && <p className="text-xs text-gray-500">Reading and converting…</p>}
        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {previewUrl && (
          <>
            <div className="border border-gray-200" style={{ borderRadius: 4, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="Converted roster preview" style={{ width: '100%', display: 'block' }} />
            </div>
            <button
              onClick={handleDownloadJpg}
              className="w-full py-3 font-bold text-sm text-white"
              style={{ background: 'var(--purple)', borderRadius: 4 }}
            >
              Download JPG
            </button>
            {ics && (
              <button
                onClick={handleDownloadIcs}
                className="w-full py-3 font-bold text-sm"
                style={{ border: '1px solid var(--purple)', color: 'var(--purple)', borderRadius: 4 }}
              >
                Download .ics
              </button>
            )}
          </>
        )}
      </div>
    </ToolShell>
  )
}
