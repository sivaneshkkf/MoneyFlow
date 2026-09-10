import { useEffect, useState } from 'react'
import { Bell, BellRing, BellOff, ShieldAlert, Info } from 'lucide-react'
import clsx from 'clsx'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'
import {
  isPushSupported, getPushPermission, getExistingPushSubscription,
  enablePushNotifications, disablePushNotifications,
} from '../notifications/pushNotifications'

const TRIGGERS = [
  'Bills & recurring payments due or overdue',
  'Budget nearing or over its limit',
  'Credit card statement due',
  'Subscription & billing updates',
]

export default function NotificationsPage() {
  const toast = useToast()
  const supported = isPushSupported()
  const [permission, setPermission] = useState(getPushPermission())
  const [enabled, setEnabled] = useState(false)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!supported) {
      setChecking(false)
      return
    }
    getExistingPushSubscription()
      .then((sub) => setEnabled(Boolean(sub)))
      .finally(() => setChecking(false))
  }, [supported])

  const toggle = async () => {
    setBusy(true)
    try {
      if (enabled) {
        await disablePushNotifications()
        setEnabled(false)
        toast.success('Push notifications turned off on this device.')
      } else {
        await enablePushNotifications()
        setEnabled(true)
        setPermission(getPushPermission())
        toast.success('Push notifications turned on for this device.')
      }
    } catch (e) {
      setPermission(getPushPermission())
      toast.error(friendlyError(e, 'Unable to update push notifications.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
              {enabled ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            </span>
            <div>
              <h2 className="text-base font-bold">System &amp; mobile notifications</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Get real alerts in your device&apos;s notification tray — even when MoneyFlow isn&apos;t open.
              </p>
            </div>
          </div>

          {supported && !checking && (
            <button
              role="switch"
              aria-checked={enabled}
              onClick={toggle}
              disabled={busy || permission === 'denied'}
              className={clsx(
                'relative h-7 w-12 shrink-0 rounded-full transition disabled:cursor-not-allowed disabled:opacity-50',
                enabled ? 'bg-success' : 'bg-ink-soft/25',
              )}
            >
              <span
                className={clsx(
                  'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform',
                  enabled ? 'translate-x-[22px]' : 'translate-x-0.5',
                )}
              />
            </button>
          )}
        </div>

        {!supported && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/[0.07] p-3 text-sm dark:bg-warning/10">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              This browser or device doesn&apos;t support push notifications. On iPhone/iPad, add MoneyFlow to your
              Home Screen first (Share → Add to Home Screen), then try again from there — Safari tabs alone can&apos;t
              receive push.
            </span>
          </div>
        )}
        {supported && permission === 'denied' && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/[0.06] p-3 text-sm">
            <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <span>Notifications are blocked for MoneyFlow. Enable them in your browser&apos;s site settings, then reload this page.</span>
          </div>
        )}

        <div className="mt-5 rounded-xl bg-success/[0.05] p-4 dark:bg-success/10">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Info className="h-4 w-4 shrink-0 text-success" /> What you&apos;ll be notified about
          </p>
          <ul className="mt-2.5 space-y-1.5 pl-6 text-sm text-ink-soft">
            {TRIGGERS.map((t) => (
              <li key={t} className="list-disc">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
