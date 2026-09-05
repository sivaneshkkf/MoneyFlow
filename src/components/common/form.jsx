import { Children, forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { Check, ChevronDown } from 'lucide-react'

export function Field({ label, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}

export const TextInput = forwardRef(function TextInput(props, ref) {
  return <input ref={ref} className="input" {...props} />
})

export const Textarea = forwardRef(function Textarea(props, ref) {
  return <textarea ref={ref} rows={3} className="input resize-y" {...props} />
})

// ---------------------------------------------------------------------------
// MoneyInput — a drop-in replacement for <TextInput type="number"> on amount
// fields. Shows the value grouped with thousands separators (en-IN, matching
// formatCurrency) while keeping a plain, comma-free numeric string in a hidden
// input so `register()` + `z.coerce.number()` keep working unchanged.
//   <MoneyInput {...register('amount')} autoFocus />
// ---------------------------------------------------------------------------
const grouper = new Intl.NumberFormat('en-IN')

function groupNumber(raw) {
  if (raw === '' || raw == null) return ''
  const s = String(raw)
  const neg = s.trim().startsWith('-')
  const cleaned = s.replace(/[^\d.]/g, '')
  if (cleaned === '' || cleaned === '.') return neg ? '-' : ''
  const [intPart, ...rest] = cleaned.split('.')
  const decPart = rest.join('').slice(0, 2)
  const intNum = intPart === '' ? 0 : Number(intPart)
  const grouped = Number.isFinite(intNum) ? grouper.format(intNum) : intPart
  const hasDot = cleaned.includes('.')
  return `${neg ? '-' : ''}${grouped}${hasDot ? '.' : ''}${decPart}`
}

function toRaw(display) {
  const s = String(display ?? '').replace(/,/g, '').replace(/[^\d.-]/g, '')
  const neg = s.startsWith('-')
  const body = s.replace(/-/g, '')
  const [i, ...rest] = body.split('.')
  const dec = rest.join('')
  const hasDot = body.includes('.')
  return `${neg ? '-' : ''}${i}${hasDot ? '.' : ''}${dec.slice(0, 2)}`
}

export const MoneyInput = forwardRef(function MoneyInput(
  { onChange, onBlur, name, disabled, className, placeholder, autoFocus, id, ...rest },
  ref,
) {
  // drop number-input-only props that may be spread in from existing call sites
  void rest.type
  void rest.step
  void rest.min
  void rest.max
  void rest.inputMode

  const hiddenRef = useRef(null)
  const visibleRef = useRef(null)
  const lastRaw = useRef(null)
  const [display, setDisplay] = useState('')

  const setRefs = (el) => {
    hiddenRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  // Pick up external changes (RHF reset()/setValue set the hidden value directly).
  useEffect(() => {
    const el = hiddenRef.current
    if (!el) return
    if (el.value !== lastRaw.current) {
      lastRaw.current = el.value
      setDisplay(groupNumber(el.value))
    }
  })

  const writeHidden = (raw) => {
    const el = hiddenRef.current
    if (!el) return
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, raw)
    lastRaw.current = raw
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  const handleChange = (e) => {
    const prev = e.target.value
    const caret = e.target.selectionStart ?? prev.length
    const raw = toRaw(prev)
    const formatted = groupNumber(raw)
    setDisplay(formatted)
    writeHidden(raw)
    // keep the caret roughly where the user expects after re-grouping
    const delta = formatted.length - prev.length
    requestAnimationFrame(() => {
      const el = visibleRef.current
      if (!el) return
      const pos = Math.max(0, Math.min(formatted.length, caret + delta))
      try {
        el.setSelectionRange(pos, pos)
      } catch {
        /* some inputs don't support selection */
      }
    })
  }

  const handleBlur = (e) => {
    setDisplay(groupNumber(hiddenRef.current?.value ?? ''))
    onBlur?.(e)
  }

  return (
    <>
      <input
        ref={setRefs}
        type="text"
        name={name}
        id={id ? `${id}__raw` : undefined}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={onChange}
        onBlur={onBlur}
      />
      <input
        ref={visibleRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={clsx('input', className)}
        placeholder={placeholder ?? '0'}
        disabled={disabled}
        autoFocus={autoFocus}
        value={display}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </>
  )
})

/**
 * Custom themed select. Renders a real (visually hidden) <select> for full
 * compatibility with React Hook Form's `register()` spread and controlled
 * `value`/`onChange` usage, plus a styled button + popover listbox on top.
 */
export const Select = forwardRef(function Select(
  { children, value, onChange, onBlur, name, className, disabled, id, renderOption, ...rest },
  ref,
) {
  const nativeRef = useRef(null)
  const wrapRef = useRef(null)
  const listRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState(value ?? '')
  const [activeIdx, setActiveIdx] = useState(-1)
  const [menuStyle, setMenuStyle] = useState({})

  const options = useMemo(
    () =>
      Children.toArray(children)
        .filter((c) => c && c.type === 'option')
        .map((c) => ({
          value: String(c.props.value ?? ''),
          label: c.props.children,
          disabled: Boolean(c.props.disabled),
          raw: c.props,
        })),
    [children],
  )

  const setRefs = (el) => {
    nativeRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  // Keep the visible value in sync (RHF sets the native value through the ref).
  useEffect(() => {
    if (value !== undefined) {
      setCurrent(String(value))
      return
    }
    const el = nativeRef.current
    if (el != null) setCurrent(el.value)
  }, [value, options])

  useEffect(() => {
    if (!open) return
    const rect = wrapRef.current?.getBoundingClientRect()
    if (rect) {
      const below = window.innerHeight - rect.bottom
      const openUp = below < 260 && rect.top > below
      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.min(280, rect.top - 12) }
          : { top: rect.bottom + 4, maxHeight: Math.min(280, below - 12) }),
      })
    }
    setActiveIdx(options.findIndex((o) => o.value === String(current)))
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false)
    }
    // Close on scroll of an ancestor (the fixed menu would detach) — but NOT when
    // the scroll happens inside the menu list itself.
    const onScroll = (e) => {
      if (listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (v) => {
    const el = nativeRef.current
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      setter.call(el, v)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    setCurrent(v)
    setOpen(false)
  }

  const onKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (open && activeIdx >= 0) commit(options[activeIdx].value)
      else setOpen(true)
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) return setOpen(true)
      setActiveIdx((i) => nextEnabled(options, i, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) return setOpen(true)
      setActiveIdx((i) => nextEnabled(options, i, -1))
    }
  }

  const selected = options.find((o) => o.value === String(current))
  const showPlaceholder = !current

  return (
    <div className={clsx('relative', className)} ref={wrapRef}>
      <select
        ref={setRefs}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        {...rest}
      >
        {children}
      </select>

      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        className={clsx(
          'input flex items-center justify-between gap-2 text-left',
          disabled && 'cursor-not-allowed opacity-50',
          !disabled && 'cursor-pointer',
        )}
      >
        <span className={clsx('truncate', showPlaceholder && 'text-ink-soft')}>
          {selected?.label ?? options[0]?.label ?? ' '}
        </span>
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-ink-soft transition', open && 'rotate-180')} />
      </button>

      {open &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            style={menuStyle}
            className="z-[110] overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#1B2523]"
          >
            {options.map((o, i) => {
              const isSelected = o.value === String(current)
              return (
                <li
                  key={o.value + i}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => !o.disabled && commit(o.value)}
                  className={clsx(
                    'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm',
                    o.disabled && 'cursor-not-allowed opacity-40',
                    !o.disabled && 'cursor-pointer',
                    !o.disabled && activeIdx === i && !isSelected && 'bg-brand-50 dark:bg-white/5',
                    isSelected
                      ? 'bg-brand-600 font-medium text-white'
                      : 'text-ink dark:text-[#E7EDEB]',
                  )}
                >
                  {renderOption ? (
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      {renderOption({ value: o.value, label: o.label, raw: o.raw, selected: isSelected })}
                    </span>
                  ) : (
                    <span className="truncate">{o.label}</span>
                  )}
                  {isSelected && <Check className="h-4 w-4 shrink-0" />}
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </div>
  )
})

function nextEnabled(options, from, dir) {
  let i = from
  for (let step = 0; step < options.length; step++) {
    i = (i + dir + options.length) % options.length
    if (!options[i].disabled) return i
  }
  return from
}
