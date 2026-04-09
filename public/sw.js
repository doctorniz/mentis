/// <reference lib="webworker" />

const CACHE_NAME = 'mentis-marrow-v1'

const PRECACHE_URLS = ['/', '/manifest.json', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  )
  self.clients.claim()
})

/**
 * `_next/static/` assets are content-hashed and immutable per build.
 * Cache-first: serve from cache instantly, only fetch on miss.
 */
function handleImmutable(request) {
  return caches.match(request).then((cached) => {
    if (cached) return cached
    return fetch(request).then((response) => {
      if (response.ok) {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((c) => c.put(request, clone))
      }
      return response
    })
  })
}

/**
 * Everything else: stale-while-revalidate.
 * Serve cache immediately (if available) and refresh in background.
 * On cache miss, wait for the network response.
 */
function handleStaleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then((cache) =>
    cache.match(request).then((cached) => {
      const fetching = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone())
          return response
        })
        .catch(() => cached)

      return cached || fetching
    })
  )
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (url.origin !== self.location.origin) return
  if (event.request.method !== 'GET') return

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(handleImmutable(event.request))
    return
  }

  event.respondWith(handleStaleWhileRevalidate(event.request))
})
