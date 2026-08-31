'use client'

import { useRef, useState } from 'react'

export default function FileDrop({
  accept,
  multiple = false,
  label = 'Tap to choose file, or drag & drop',
  onFiles,
}: {
  accept: string
  multiple?: boolean
  label?: string
  onFiles: (files: File[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    onFiles(Array.from(list))
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        handleFiles(e.dataTransfer.files)
      }}
      className="flex flex-col items-center justify-center gap-2 text-center cursor-pointer"
      style={{
        border: `2px dashed ${dragOver ? 'var(--purple)' : '#bbb'}`,
        background: dragOver ? '#f3e8ff' : '#fafafa',
        borderRadius: 4,
        padding: '32px 16px',
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--purple)" strokeWidth={1.6}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" />
      </svg>
      <span className="text-xs font-semibold" style={{ color: 'var(--purple)' }}>{label}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}
