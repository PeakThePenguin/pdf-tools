'use client'

import { useEffect } from 'react'

// A tab left open across a deploy (common for this kiosk-style PWA — it's
// added to the home screen and rarely force-quit) can end up with a
// half-fetched, content-hashed JS chunk stuck in the cache: the fetch gets
// interrupted mid-download on a flaky connection, the response still comes
// back `ok`, the service worker caches it as-is, and every retry after that
// serves the same truncated chunk forever (cache-first, since a
// content-hashed URL is assumed immutable). The symptom is a generically
// worded runtime error like "X is not a function" for whatever export
// happened to land after the truncation point. Recover from that class of
// error automatically: clear this origin's caches and reload once, so the
// next fetch goes to the network instead of replaying the same broken
// response. Guarded by a sessionStorage flag so a *genuine* bug doesn't
// reload-loop the page.
function installChunkErrorRecovery() {
  const RECOVERY_KEY = 'pdf-tools-chunk-recovery-attempted'
  const RECOVERABLE = /is not a function|Loading chunk|ChunkLoadError|Failed to fetch dynamically imported module/i

  function recover(message: string) {
    if (!RECOVERABLE.test(message)) return
    if (sessionStorage.getItem(RECOVERY_KEY)) return
    sessionStorage.setItem(RECOVERY_KEY, '1')
    const reload = () => window.location.reload()
    if ('caches' in window) {
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).finally(reload)
    } else {
      reload()
    }
  }

  window.addEventListener('error', (e) => recover(e.message || ''))
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string } | string | undefined
    recover((typeof reason === 'string' ? reason : reason?.message) || '')
  })
}

export default function ServiceWorkerRegister() {
  useEffect(() => {
    installChunkErrorRecovery()
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Offline support just won't be available — every tool still works
        // fine online without it.
      })
    }
  }, [])

  return null
}
