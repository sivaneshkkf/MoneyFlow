import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Generic slide-in mobile drawer (left edge) — backdrop, Escape, focus trap,
 * background-scroll lock, and a real slide/fade transition (plain CSS
 * transform + opacity, no animation library). Reused by the main app's
 * navigation drawer; the shape matches AdminSidebarDrawer so both could
 * share this later.
 */
export default function MobileDrawer({ open, onClose, children, widthClass = 'w-72 max-w-[85vw]' }) {
  const panelRef = useRef(null)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  // Mount immediately on open (so the transition has something to animate
  // from); unmount only after the close transition finishes.
  useEffect(() => {
    if (open) {
      setMounted(true)
      const raf = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(raf)
    }
    setVisible(false)
    const t = setTimeout(() => setMounted(false), 220)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll(
          'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
        )
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    const focusTimer = setTimeout(() => panelRef.current?.querySelector('a,button')?.focus(), 20)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      clearTimeout(focusTimer)
    }
  }, [open, onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[95] lg:hidden">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={`absolute inset-y-0 left-0 flex ${widthClass} flex-col bg-white shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none dark:bg-[#131B19] ${visible ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {children}
      </aside>
    </div>,
    document.body,
  )
}
