import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, Eye, Pencil, RefreshCw, PowerOff, Power, Trash2 } from 'lucide-react'

export default function AccountMenu({ account, onView, onEdit, onRefresh, onToggleActive, onDelete, tone = 'light' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({})
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      const width = 180
      setPos({
        position: 'fixed',
        top: r.bottom + 6,
        left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)),
        width,
      })
    }
    const close = (e) => {
      if (!btnRef.current?.contains(e.target) && !menuRef.current?.contains(e.target)) setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  const item = (Icon, label, fn, danger) => (
    <button
      role="menuitem"
      onClick={() => {
        setOpen(false)
        fn?.(account)
      }}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-brand-50 dark:hover:bg-white/5 ${
        danger ? 'text-danger' : 'text-ink dark:text-[#E7EDEB]'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  )

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label="Account actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`rounded-lg p-1 transition ${
          tone === 'dark'
            ? 'text-white/70 hover:bg-white/15 hover:text-white'
            : 'text-ink-soft hover:bg-brand-50 hover:text-ink dark:hover:bg-white/10'
        }`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={pos}
            className="z-[120] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl dark:border-white/10 dark:bg-[#1B2523]"
          >
            {onView && item(Eye, 'View details', onView)}
            {item(Pencil, 'Edit', onEdit)}
            {item(RefreshCw, 'Refresh balance', onRefresh)}
            {item(
              account.is_active ? PowerOff : Power,
              account.is_active ? 'Deactivate' : 'Activate',
              onToggleActive,
            )}
            <div className="my-1 h-px bg-line dark:bg-white/10" />
            {item(Trash2, 'Delete', onDelete, true)}
          </div>,
          document.body,
        )}
    </>
  )
}
