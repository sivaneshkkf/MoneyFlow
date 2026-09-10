// Custom service worker source (built by vite-plugin-pwa's injectManifest
// strategy — see vite.config.js). Replaces the fully auto-generated
// Workbox service worker so we can add a real `push` / `notificationclick`
// handler (049_push_notifications.sql / send-push-notifications Edge
// Function) — everything else here reproduces exactly what the previous
// generateSW config did: precache the app shell, serve index.html for
// client-side routes, never touch /api/ traffic.

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'

precacheAndRoute(self.__WB_MANIFEST)

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//],
  }),
)

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

// --- Push notifications ---------------------------------------------------
// Payload shape sent by supabase/functions/send-push-notifications:
// { title, body, severity, url }
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'MoneyFlow', body: event.data?.text() ?? '' }
  }

  const title = data.title || 'MoneyFlow'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/dashboard' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
      return undefined
    }),
  )
})
