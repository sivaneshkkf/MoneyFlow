import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, description, children, size = 'md' }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement

    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
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
    // Lock the app's scroll container (<main>), compensating for the scrollbar
    // width so the content doesn't jump when it disappears.
    const scroller = document.querySelector('main') ?? document.body
    const barW = scroller.offsetWidth - scroller.clientWidth
    scroller.style.overflow = 'hidden'
    if (barW > 0) scroller.style.paddingRight = `${barW}px`
    document.body.style.overflow = 'hidden'
    setTimeout(() => {
      const target = panelRef.current?.querySelector('input,select,textarea,button')
      target?.focus()
    }, 20)

    return () => {
      document.removeEventListener('keydown', onKey)
      scroller.style.overflow = ''
      scroller.style.paddingRight = ''
      document.body.style.overflow = ''
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size]

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92vh] w-full ${width} flex-col rounded-t-2xl bg-white shadow-xl dark:bg-[#161F1D] sm:rounded-2xl`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-soft">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="text-ink-soft hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="modal-body min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
