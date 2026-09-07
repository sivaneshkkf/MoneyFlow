import { Share, SquarePlus, Plus } from 'lucide-react'
import Modal from '../common/Modal'
import MoneyFlowLogo from '../branding/MoneyFlowLogo'

/**
 * iOS (Safari, Chrome, Edge, Firefox — all WebKit under Apple's rules) has
 * no `beforeinstallprompt` API at all, so there is no native install dialog
 * any website can trigger there. The only real path is the manual
 * Share > Add to Home Screen flow — this walks the user through it visually
 * instead of leaving them with a one-line toast.
 */
export default function IOSInstallModal({ open, onClose }) {
  const isChromeIOS = /CriOS/.test(navigator.userAgent)

  const steps = [
    {
      icon: Share,
      title: isChromeIOS ? 'Tap the Share icon' : 'Tap the Share icon',
      detail: isChromeIOS
        ? 'It\'s at the top right of the address bar.'
        : 'It\'s in the bottom toolbar (top, if using an iPad).',
    },
    {
      icon: SquarePlus,
      title: 'Tap "Add to Home Screen"',
      detail: 'Scroll down the share sheet if you don\'t see it right away.',
    },
    {
      icon: Plus,
      title: 'Tap "Add"',
      detail: 'MoneyFlow appears on your Home Screen like a real app.',
    },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Install MoneyFlow" size="sm">
      <div className="flex flex-col items-center gap-1 pb-5 pt-1 text-center">
        <MoneyFlowLogo variant="icon" size="h-12" />
        <p className="mt-2 text-sm text-ink-soft">
          iOS doesn't let any website open its install dialog directly — but adding
          MoneyFlow to your Home Screen takes three taps.
        </p>
      </div>
      <ol className="space-y-4">
        {steps.map((step, i) => (
          <li key={step.title} className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-900 dark:bg-white/10 dark:text-white">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <step.icon className="h-4 w-4 shrink-0 text-brand-700 dark:text-brand-400" />
                {step.title}
              </p>
              <p className="mt-0.5 text-xs text-ink-soft">{step.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    </Modal>
  )
}
