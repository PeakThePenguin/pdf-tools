'use client'

import { useEffect, useMemo } from 'react'

export default function ImagePickerGrid({
  files,
  onChange,
}: {
  files: File[]
  onChange: (files: File[]) => void
}) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])

  useEffect(() => {
    return () => urls.forEach((u) => URL.revokeObjectURL(u))
  }, [urls])

  function move(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= files.length) return
    const next = [...files]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  function remove(i: number) {
    onChange(files.filter((_, idx) => idx !== i))
  }

  if (files.length === 0) return null

  return (
    <div className="grid grid-cols-3 gap-2">
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="relative border border-gray-200 rounded overflow-hidden bg-gray-50" style={{ aspectRatio: '3/4' }}>
          {urls[i] && <img src={urls[i]} alt={f.name} className="w-full h-full object-cover" />}
          <span className="absolute bottom-0.5 left-0.5 text-[11px] font-bold text-white px-1 rounded" style={{ background: 'rgba(0,0,0,0.55)' }}>
            {i + 1}
          </span>
          <div className="absolute top-0.5 right-0.5 flex gap-0.5">
            <button onClick={() => move(i, -1)} disabled={i === 0} className="w-5 h-5 flex items-center justify-center text-[12px] rounded text-white disabled:opacity-30" style={{ background: 'rgba(0,0,0,0.55)' }}>←</button>
            <button onClick={() => move(i, 1)} disabled={i === files.length - 1} className="w-5 h-5 flex items-center justify-center text-[12px] rounded text-white disabled:opacity-30" style={{ background: 'rgba(0,0,0,0.55)' }}>→</button>
            <button onClick={() => remove(i)} className="w-5 h-5 flex items-center justify-center text-[12px] rounded text-white" style={{ background: 'rgba(220,38,38,0.85)' }}>✕</button>
          </div>
        </div>
      ))}
    </div>
  )
}
