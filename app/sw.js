// Groundwork offline helper: keeps the app's own files on the phone so it opens with no signal.
// Only this site's files are kept — never data (Supabase calls go straight to the network, untouched).
// Pages: network first (a new version shows as soon as there's signal), the saved copy when offline.
// Built files (assets/…, names change every version): saved the first time, then served from the phone.
const CACHE = 'groundwork-app-v1'

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    try {
      const res = await fetch('./', { cache: 'no-store' })
      if (res.ok) {
        const html = await res.clone().text()
        await cache.put('./', res)
        const files = [...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map(m => './' + m[1])
        await cache.addAll([...new Set([...files, './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'])])
      }
    } catch { /* offline during install: files are saved as they are used instead */ }
    self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith(new URL('./', self.location).pathname)) return

  if (req.mode === 'navigate') {
    // The app is one page: any address inside it opens the saved index when offline.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const saved = url.pathname.endsWith('r.html') ? undefined : await cache.match('./')
      try {
        // Weak signal that never answers: after 4 s use the saved copy (if there is one).
        const res = await Promise.race([fetch(req), new Promise((_, no) => setTimeout(() => saved ? no(new Error('slow')) : null, 4000))])
        if (res.ok && !url.pathname.endsWith('r.html')) cache.put('./', res.clone())
        return res
      } catch {
        return (await cache.match(url.pathname.endsWith('r.html') ? req : './')) ?? Response.error()
      }
    })())
    return
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const hit = await cache.match(req)
    if (hit) return hit
    const res = await fetch(req)
    if (res.ok && (url.pathname.includes('/assets/') || /\.(png|webmanifest)$/.test(url.pathname))) cache.put(req, res.clone())
    return res
  })())
})
