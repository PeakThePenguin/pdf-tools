'use client'

import Link from 'next/link'

interface Tool {
  href: string
  icon: string
  title: string
  desc: string
  color: string
}

const TOOLS: Tool[] = [
  { href: '/compress-pdf', icon: '🗜️', title: 'Compress PDF', desc: 'Shrink a PDF by recompressing its embedded photos.', color: '#D97706' },
  { href: '/merge', icon: '📎', title: 'Merge PDF', desc: 'Combine multiple PDFs into one, in any order.', color: '#3B82F6' },
  { href: '/split', icon: '✂️', title: 'Split / Extract pages', desc: 'Pull out specific pages or split every page apart.', color: '#0EA5E9' },
  { href: '/organize', icon: '🗂️', title: 'Organize pages', desc: 'Reorder, rotate, or delete pages visually.', color: '#8B5CF6' },
  { href: '/remove-pages', icon: '🗑️', title: 'Remove pages', desc: 'Delete specific pages from a PDF.', color: '#8B5CF6' },
  { href: '/rotate', icon: '🔄', title: 'Rotate PDF', desc: 'Rotate every page 90°, 180°, or 270°.', color: '#EF4444' },
  { href: '/reverse', icon: '⇄', title: 'Reverse pages', desc: 'Flip the page order end to end.', color: '#EF4444' },
  { href: '/n-up', icon: '▦', title: 'N-up (multi per sheet)', desc: 'Lay out 2, 4, 6, or 9 pages on one sheet.', color: '#14B8A6' },
  { href: '/resize-a4', icon: '📐', title: 'Resize to A4', desc: 'Fit every page onto a standard A4 sheet.', color: '#14B8A6' },
  { href: '/remove-blank', icon: '⬜', title: 'Remove blank pages', desc: 'Auto-detect and strip out empty pages.', color: '#14B8A6' },
  { href: '/images-to-pdf', icon: '🖼️', title: 'Images → PDF', desc: 'Combine photos or scans into one PDF.', color: '#2563EB' },
  { href: '/scan', icon: '📷', title: 'Scan document', desc: 'Capture pages with your camera and save as PDF.', color: '#DB2777' },
  { href: '/pdf-to-images', icon: '🖨️', title: 'PDF → Images', desc: 'Export every page as a JPG or PNG.', color: '#DB2777' },
  { href: '/compress-images', icon: '📦', title: 'Compress images', desc: 'Shrink JPG / PNG / WebP file size.', color: '#D97706' },
  { href: '/watermark', icon: '💧', title: 'Add watermark', desc: 'Stamp a diagonal text watermark on every page.', color: '#7C3AED' },
  { href: '/page-numbers', icon: '#️⃣', title: 'Add page numbers', desc: 'Number every page, choose position & start.', color: '#4F46E5' },
  { href: '/remove-metadata', icon: '🛡️', title: 'Remove metadata', desc: 'Strip title, author, and other hidden info.', color: '#475569' },
]

export default function PdfToolsPage() {
  return (
    <div className="app-shell app-shell--home">
      <header className="app-header app-header--home">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/thai-logo.png" alt="" width={44} height={44} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="app-header-title">PC-TEAM 4 PDF TOOLS</div>
            <div className="app-header-subtitle">Runs entirely in your browser</div>
          </div>
        </div>
      </header>

      <div className="page-body">
        <div className="px-3 pt-3 pb-1">
          <h1 className="text-base font-bold text-gray-900">All tools</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {TOOLS.length} PDF & image tools. Everything runs on your device — files never leave your browser.
          </p>
        </div>

        <div className="px-3 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 mt-2">
          {TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="block p-3 relative overflow-hidden"
              style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}
            >
              <div
                className="flex items-center justify-center mb-2"
                style={{ width: 34, height: 34, borderRadius: 8, background: `${tool.color}1a`, fontSize: 17 }}
              >
                <span>{tool.icon}</span>
              </div>
              <div className="text-xs font-bold text-gray-900 leading-tight">{tool.title}</div>
              <div className="text-[10px] text-gray-500 mt-0.5 leading-snug">{tool.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
