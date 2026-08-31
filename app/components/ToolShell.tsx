'use client'

import { useRouter } from 'next/navigation'

export default function ToolShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  const router = useRouter()

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push('/')}
            aria-label="Back to PDF tools"
            className="flex-shrink-0 text-white/90"
            style={{ width: 24, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/thai-logo.png" alt="" width={30} height={30} className="flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="app-header-title">{title}</div>
            {subtitle && <div className="app-header-subtitle">{subtitle}</div>}
          </div>
        </div>
      </header>
      <div className="page-body" style={{ paddingBottom: 24 }}>
        {children}
      </div>
    </div>
  )
}
