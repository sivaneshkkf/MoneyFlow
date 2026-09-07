import { useEffect, useState } from 'react'

/**
 * Wraps the standard `beforeinstallprompt` PWA API — the app already ships
 * a real manifest + registered service worker (see main.jsx), so this is a
 * genuine install prompt, not a fake button.
 *
 * The event is captured as early as possible in main.jsx (before React even
 * mounts) and stashed on `window.__mfInstallPrompt`, because the event
 * fires only once per page load and can arrive before this hook's own
 * listener would otherwise be attached — this hook picks up whatever was
 * captured there, then keeps listening for later loads too.
 *
 * Only Chromium-based browsers (Chrome/Edge/Android) fire this event —
 * Safari/iOS has no programmatic install prompt at all (users add the app
 * via Share > Add to Home Screen instead), so `canInstall` simply stays
 * false there rather than showing a button that would do nothing.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(() => window.__mfInstallPrompt ?? null)
  const [installed, setInstalled] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(display-mode: standalone)').matches),
  )

  useEffect(() => {
    // Covers the case where main.jsx captured the event after this hook
    // had already rendered once but before this effect's listeners below
    // were attached.
    if (window.__mfInstallPrompt && !deferredPrompt) {
      setDeferredPrompt(window.__mfInstallPrompt)
    }

    const onReady = () => setDeferredPrompt(window.__mfInstallPrompt)
    const onBeforeInstall = (e) => {
      e.preventDefault()
      window.__mfInstallPrompt = e
      setDeferredPrompt(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      window.__mfInstallPrompt = null
      setDeferredPrompt(null)
    }
    window.addEventListener('mf-install-prompt-ready', onReady)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('mf-install-prompt-ready', onReady)
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const promptInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    window.__mfInstallPrompt = null
    setDeferredPrompt(null)
  }

  return { canInstall: Boolean(deferredPrompt) && !installed, installed, promptInstall }
}
