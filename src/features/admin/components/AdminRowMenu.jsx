import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import clsx from 'clsx'

/** Three-dot row action menu for admin tables — portalled so it's never clipped by the table's overflow-x-auto wrapper. */
export default function AdminRowMenu({ items, label = 'Actions' }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 190) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        aria-label={label}
        className="rounded-lg p-1.5 text-ink-soft hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: 190, zIndex: 100 }}
            className="overflow-hidden rounded-xl border border-line bg-white py-1 shadow-xl dark:border-white/10 dark:bg-[#161F1D]"
          >
            {items.map((it) => (
              <button
                key={it.label}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpen(false)
                  it.onClick()
                }}
                disabled={it.disabled}
                className={clsx(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm disabled:opacity-40',
                  it.tone === 'danger' ? 'text-danger hover:bg-danger/10' : 'hover:bg-brand-50 dark:hover:bg-white/5',
                )}
              >
                {it.icon && <it.icon className="h-3.5 w-3.5" />}
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
