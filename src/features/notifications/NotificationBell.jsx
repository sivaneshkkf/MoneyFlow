import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Bell, Check, X } from 'lucide-react'
import clsx from 'clsx'
import { formatRelative } from '../../utils/format'
import { useNotifications, useNotificationMutations } from './useNotifications'
import { alertMeta, TONE_CLASS } from './notificationMeta'

export default function NotificationBell() {
  const { data } = useNotifications()
  const { markRead, markAllRead } = useNotificationMutations()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)

  const rows = data?.rows ?? []
  const unread = data?.unread ?? 0

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const width = Math.min(380, window.innerWidth - 16)
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.right - width, window.innerWidth - 8 - width)), width })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost relative !p-2"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 100 }}
            className="overflow-hidden rounded-2xl border border-line bg-white shadow-xl dark:border-white/10 dark:bg-[#161F1D]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3 dark:border-white/10">
              <p className="text-sm font-bold">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
                >
                  <Check className="h-3.5 w-3.5" /> Mark all as read
                </button>
              )}
            </div>

            {rows.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-ink-soft">You&apos;re all caught up 🎉</p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto dark:divide-white/5">
                {rows.map((a) => {
                  const meta = alertMeta(a)
                  const Icon = meta.icon
                  return (
                    <li
                      key={a.id}
                      className={clsx('flex gap-3 px-4 py-3', !a.is_read && 'bg-brand-50/50 dark:bg-white/5')}
                    >
                      <span className={clsx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg', TONE_CLASS[meta.tone])}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-snug">{a.title}</p>
                        {a.body && <p className="truncate text-xs text-ink-soft">{a.body}</p>}
                        <p className="mt-0.5 text-[11px] text-ink-soft">{formatRelative(a.created_at)}</p>
                      </div>
                      {!a.is_read && (
                        <button
                          onClick={() => markRead.mutate(a.id)}
                          aria-label="Mark as read"
                          className="shrink-0 self-start rounded p-1 text-ink-soft hover:bg-brand-100 dark:hover:bg-white/10"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <Link
              to="/bills"
              onClick={() => setOpen(false)}
              className="block border-t border-line px-4 py-3 text-center text-xs font-semibold text-brand-700 hover:bg-brand-50 dark:border-white/10 dark:text-brand-400 dark:hover:bg-white/5"
            >
              View Bills &amp; Recurring
            </Link>
          </div>,
          document.body,
        )}
    </>
  )
}
