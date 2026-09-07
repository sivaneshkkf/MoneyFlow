import { useEffect, useState } from 'react'

/**
 * Wraps the standard `beforeinstallprompt` PWA API — the app already ships
 * a real manifest + registered service worker (see main.jsx), so this is a
 * genuine install prompt, not a fake button.
 *
 * Only Chromium-based browsers (Chrome/Edge/Android) fire this event —
 * Safari/iOS has no programmatic install prompt at all (users add the app
 * via Share > Add to Home Screen instead), so `canInstall` simply stays
 * false there rather than showing a button that would do nothing.
 */
export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [installed, setInstalled] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(display-mode: standalone)').matches),
  )

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setInstalled(true)
    setDeferredPrompt(null)
  }

  return { canInstall: Boolean(deferredPrompt) && !installed, installed, promptInstall }
}
