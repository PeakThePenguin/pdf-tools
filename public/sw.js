// Offline cache for the PDF Tools PWA. Hand-rolled (no Serwist — it needs a
// webpack build and this project uses Turbopack) but deliberately simple:
// the app is fully static per-page, so "cache what's been visited, serve it
// back when offline" covers the real offline story without hardcoding a
// route list that would go stale every time a tool page is added.
const CACHE_VERSION = 'v1'
const CACHE_NAME = `pdf-tools-${CACHE_VERSION}`

// The home page plus the small set of shared, always-needed assets — these
// are guaranteed available offline right after the very first visit.
const PRECACHE_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/apple-touch-icon.png',
  '/thai-logo.png',
  '/pdf.worker.min.mjs',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function putInCache(request, response) {
  if (response.ok) {
    caches.open(CACHE_NAME).then((cache) => cache.put(request, response))
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Full page loads / refreshes: prefer the network (so an online user
  // always sees the latest deploy), cache every successful response, and
  // fall back to whatever's cached — the exact page if we have it, else the
  // app shell — when there's no connection at all.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          putInCache(request, response.clone())
          return response
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    )
    return
  }

  // Next.js build output under /_next/static/ is content-hashed — once
  // fetched, a given URL's content never changes, so cache-first is safe.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            putInCache(request, response.clone())
            return response
          })
      )
    )
    return
  }

  // Everything else same-origin (icons, fonts, the pdf.js worker, RSC data
  // fetches for client-side navigation): cache-first, populated on first use.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        putInCache(request, response.clone())
        return response
      })
    })
  )
})
