'use client'

import { useEffect, useRef, useState } from 'react'
import ToolShell from '@/app/components/ToolShell'
import ImagePickerGrid from '@/app/components/ImagePickerGrid'
import { imagesToPdf, downloadBytes } from '@/app/lib/engine'

export default function ScanPage() {
  const galleryRef = useRef<HTMLInputElement>(null)
  const fallbackCameraRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

  useEffect(() => {
    return () => stopStream()
  }, [])

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list || list.length === 0) return
    setError(null)
    setFiles((prev) => [...prev, ...Array.from(list)])
  }

  async function openCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      setCameraOpen(true)
      // Video element mounts after state update — attach once it's in the DOM.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = stream
      })
    } catch {
      // No camera access (desktop, permission denied, unsupported) — fall back
      // to the OS file-picker camera capture, one photo per tap.
      fallbackCameraRef.current?.click()
    }
  }

  function closeCamera() {
    stopStream()
    setCameraOpen(false)
  }

  function capturePhoto() {
    const video = videoRef.current
    if (!video || video.videoWidth === 0) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        addFiles([new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' })])
      },
      'image/jpeg',
      0.92
    )
  }

  async function handleRun() {
    if (files.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const out = await imagesToPdf(files, { fitToA4: true })
      downloadBytes(out, `scan_${files.length}_pages.pdf`)
    } catch (e) {
      setError((e as Error).message || 'Failed to build PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ToolShell title="SCAN DOCUMENT" subtitle="Capture pages with your camera">
      <div className="px-3 pt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={openCamera}
            className="py-4 flex flex-col items-center gap-1 font-bold text-xs text-white"
            style={{ background: 'var(--purple)', borderRadius: 4 }}
          >
            <span style={{ fontSize: 18 }}>📷</span>
            Take photo
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="py-4 flex flex-col items-center gap-1 font-bold text-xs"
            style={{ background: '#fff', color: 'var(--purple)', border: '1px solid var(--purple)', borderRadius: 4 }}
          >
            <span style={{ fontSize: 18 }}>🖼️</span>
            Choose from gallery
          </button>
        </div>

        <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        <input ref={fallbackCameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />

        {error && <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>}

        {files.length > 0 && (
          <p className="text-[11px] text-gray-500">{files.length} page{files.length === 1 ? '' : 's'} captured — reorder with ← →</p>
        )}

        <ImagePickerGrid files={files} onChange={setFiles} />

        {files.length > 0 && (
          <button
            onClick={handleRun}
            disabled={busy}
            className="w-full py-3 font-bold text-sm text-white disabled:opacity-40"
            style={{ background: 'var(--purple)', borderRadius: 4 }}
          >
            {busy ? 'Building PDF…' : `Save as PDF (${files.length} page${files.length === 1 ? '' : 's'})`}
          </button>
        )}
      </div>

      {cameraOpen && (
        <div className="fixed inset-0 flex flex-col" style={{ background: '#000', zIndex: 100 }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <span className="text-white text-sm font-bold">{files.length} page{files.length === 1 ? '' : 's'} captured</span>
            <button onClick={closeCamera} className="text-white text-sm font-bold px-3 py-1" style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 4 }}>
              Done
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
          </div>

          <div className="flex items-center justify-center py-6" style={{ background: 'rgba(0,0,0,0.6)' }}>
            <button
              onClick={capturePhoto}
              aria-label="Capture photo"
              style={{
                width: 68,
                height: 68,
                borderRadius: '50%',
                background: '#fff',
                border: '4px solid rgba(255,255,255,0.4)',
              }}
            />
          </div>
        </div>
      )}
    </ToolShell>
  )
}
