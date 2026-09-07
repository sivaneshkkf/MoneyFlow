import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useInstallPrompt } from './useInstallPrompt'
import { useToast } from '../common/ToastProvider'
import IOSInstallModal from './IOSInstallModal'

/**
 * Chrome only fires `beforeinstallprompt` under conditions it controls
 * (e.g. it stays silent for a while after a prior dismissal on this
 * origin), so gating the button's visibility on that event means it can
 * vanish for reasons that have nothing to do with whether the app is
 * actually installable. Instead: always show the button (unless the app is
 * already running installed), use the real native prompt when the browser
 * has offered one, and fall back to honest manual instructions otherwise —
 * never a dead click.
 *
 * iOS (Safari, Chrome, every browser there — all WebKit under Apple's
 * rules) never fires `beforeinstallprompt` at all, so `canInstall` is
 * always false there. Rather than a plain toast, that case gets a proper
 * step-by-step visual walkthrough (IOSInstallModal) since it's the only
 * real path to installing on iOS.
 */
export default function InstallAppButton() {
  const { canInstall, installed, promptInstall } = useInstallPrompt()
  const toast = useToast()
  // The browser can take a moment to actually render its native install
  // dialog after prompt() is called — this stays true for that whole gap,
  // through to the user's Install/Cancel choice, so the button never looks
  // idle while something is still happening.
  const [loading, setLoading] = useState(false)
  const [iosModalOpen, setIosModalOpen] = useState(false)

  if (installed) return null

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)

  const onClick = async () => {
    if (!canInstall) {
      if (isIOS) {
        setIosModalOpen(true)
      } else {
        toast.info(
          'Open your browser\'s menu and choose "Install MoneyFlow" (or "Add to Home Screen") to install the app.',
        )
      }
      return
    }
    setLoading(true)
    try {
      await promptInstall()
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={onClick}
        disabled={loading}
        aria-label="Install MoneyFlow app"
        aria-busy={loading}
        className="animate-install-pulse group inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-br from-dark to-brand-700 px-2.5 py-2 text-white shadow-sm transition hover:brightness-110 active:brightness-95 disabled:cursor-wait disabled:opacity-90 sm:px-3.5"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <Download className="animate-install-bob h-4 w-4 shrink-0" />
        )}
        <span className="hidden text-xs font-semibold tracking-wide sm:inline">{loading ? 'Opening…' : 'Install app'}</span>
      </button>
      {isIOS && <IOSInstallModal open={iosModalOpen} onClose={() => setIosModalOpen(false)} />}
    </>
  )
}
