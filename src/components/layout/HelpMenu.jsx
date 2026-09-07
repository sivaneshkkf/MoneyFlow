import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { HelpCircle, ChevronDown, MessageCircle, Info } from 'lucide-react'

// Only two items on purpose: this app has no separate documentation/help
// center content, so a "Help Center" entry would point nowhere real. Both
// destinations here are actual pages already in the app.
const ITEMS = [
  {
    to: '/contact',
    icon: MessageCircle,
    title: 'Contact Support',
    description: 'Get help from our team',
  },
  {
    to: '/pricing#faq',
    icon: Info,
    title: 'FAQs',
    description: 'Find quick answers',
  },
]

export default function HelpMenu() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const width = 240
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 8 - width)), width })
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
        className="hidden items-center gap-1.5 rounded-xl border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-white sm:inline-flex"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Help
        <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 100 }}
            className="overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-[#161F1D]"
          >
            {ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.title}
                  to={item.to}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-brand-50 dark:hover:bg-white/5"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
                  <span>
                    <span className="block text-sm font-semibold">{item.title}</span>
                    <span className="block text-xs text-ink-soft">{item.description}</span>
                  </span>
                </Link>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
