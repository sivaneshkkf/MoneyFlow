import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Generates the service worker at build time (Workbox) and injects
      // its registration into index.html automatically — replaces the old
      // hand-written public/sw.js + manual navigator.serviceWorker.register
      // call in main.jsx.
      registerType: 'autoUpdate',
      includeAssets: [
        'icon-192.png', 'icon-512.png', 'icon-192-maskable.png', 'icon-512-maskable.png',
        'logo.png', 'screenshot1.png', 'screenshot2.png',
      ],
      // The manifest/service worker are only generated on `vite build` by
      // default — `npm run dev` serves neither, so DevTools shows "No
      // manifest detected" there. This turns them on for the dev server too.
      devOptions: {
        enabled: true,
        type: 'module',
      },
      manifest: {
        name: 'MoneyFlow',
        short_name: 'MoneyFlow',
        description: 'Take control of your money. Personal finance, budgeting, savings and lending.',
        theme_color: '#172321',
        background_color: '#F5F7F6',
        display: 'standalone',
        start_url: '/dashboard',
        // Pins a stable app identity so a future change to start_url can
        // never make Chrome treat it as a different app — this is exactly
        // what Chrome's own manifest inspector suggests.
        id: '/dashboard',
        // Absolute paths (not relative to the manifest's own URL) — avoids
        // any ambiguity about where they resolve from.
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Maskable variants: the glyph is padded into a safe zone on a
          // solid brand-color background, so install dialogs and home-screen
          // icons that crop to a circle/squircle (like Edge's install
          // prompt) render the real icon instead of falling back to a
          // generic letter avatar.
          { src: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Real screenshots of the actual app (Dashboard, Accounts) — both
        // are desktop-shaped, so both are correctly "wide", not "narrow".
        // Chrome's install UI will still note no mobile ("narrow") shot is
        // available — leave that until we have an actual phone-shaped one,
        // rather than mislabeling one of these.
        screenshots: [
          { src: '/screenshot1.png', sizes: '1909x1031', type: 'image/png', form_factor: 'wide', label: 'MoneyFlow Dashboard' },
          { src: '/screenshot2.png', sizes: '1905x1031', type: 'image/png', form_factor: 'wide', label: 'MoneyFlow Accounts' },
        ],
      },
      workbox: {
        // App-shell caching only — never cache Supabase/API traffic, same
        // rule the old sw.js followed.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [],
      },
    }),
  ],
})
