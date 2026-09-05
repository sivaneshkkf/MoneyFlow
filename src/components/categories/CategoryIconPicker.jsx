import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import CategoryIcon from './CategoryIcon'
import { ICON_GROUPS, searchIcons } from './categoryIcons'

/**
 * Modern searchable Lucide icon picker.
 * `value` / `onChange` deal in the stable icon name string only.
 */
export default function CategoryIconPicker({ value, onChange, accent = '#2F6F63' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('All')
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const popRef = useRef(null)
  const searchRef = useRef(null)

  const results = useMemo(() => searchIcons(query, group), [query, group])

  const place = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(420, window.innerWidth - 16)
    let left = r.left
    if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width
    if (left < 8) left = 8
    const below = window.innerHeight - r.bottom
    const openUp = below < 360 && r.top > below
    setPos({
      left,
      width,
      top: openUp ? undefined : r.bottom + 6,
      bottom: openUp ? window.innerHeight - r.top + 6 : undefined,
    })
  }

  useLayoutEffect(() => {
    if (open) place()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // Swallow it so a surrounding Modal doesn't also close.
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const onClick = (e) => {
      if (popRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onScroll = () => place()
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onClick)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    const t = setTimeout(() => searchRef.current?.focus(), 20)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
      clearTimeout(t)
    }
  }, [open])

  const pick = (name) => {
    onChange(name)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="input flex w-full items-center gap-3 text-left"
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
          style={{ background: accent }}
        >
          <CategoryIcon name={value} size={17} />
        </span>
        <span className="flex-1 truncate text-sm">{value || 'Choose an icon'}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label="Choose a category icon"
            style={{ position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width, zIndex: 100 }}
            className="rounded-2xl border border-line bg-white p-3 shadow-xl dark:border-white/10 dark:bg-[#161F1D]"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search icons…"
                className="input h-10 pl-9 pr-9 text-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-soft hover:bg-brand-50 dark:hover:bg-white/5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ICON_GROUPS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  className={clsx(
                    'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition',
                    group === g
                      ? 'bg-dark text-white dark:bg-brand-700'
                      : 'bg-brand-50 text-ink-soft hover:bg-brand-100 dark:bg-white/5 dark:hover:bg-white/10',
                  )}
                >
                  {g}
                </button>
              ))}
            </div>

            {results.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink-soft">No icons found</p>
            ) : (
              <div className="mt-1 grid max-h-60 grid-cols-6 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-7">
                {results.map(({ name }) => {
                  const selected = name === value
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => pick(name)}
                      aria-label={`Select ${name} icon`}
                      aria-pressed={selected}
                      title={name}
                      className={clsx(
                        'grid aspect-square place-items-center rounded-xl border transition',
                        selected
                          ? 'border-transparent text-white'
                          : 'border-line text-ink-soft hover:bg-brand-50 hover:text-ink dark:border-white/10 dark:hover:bg-white/5',
                      )}
                      style={selected ? { background: accent, boxShadow: `0 0 0 2px ${accent}55` } : undefined}
                    >
                      <CategoryIcon name={name} size={18} />
                    </button>
                  )
                })}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
