import { useId } from 'react'

// Pure CSS/SVG card ornaments — no external images.

export function Chip({ className = '' }) {
  return (
    <div
      className={`relative h-7 w-10 overflow-hidden rounded-md ${className}`}
      style={{
        background: 'linear-gradient(135deg,#E9D9A6,#B8973F 45%,#F3E7BE 60%,#9C7C33)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25)',
      }}
      aria-hidden="true"
    >
      <div className="absolute inset-0" style={{ background: 'repeating-linear-gradient(90deg,transparent 0 8px,rgba(0,0,0,0.18) 8px 9px)' }} />
      <div className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-black/25" />
      <div className="absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-black/25" />
    </div>
  )
}

export function Contactless({ className = '', color = 'currentColor' }) {
  // Standard "))" contactless waves — concentric arcs opening to the right.
  const arcs = [
    { d: 'M8 9 A 5 5 0 0 1 8 15', o: 0.95 },
    { d: 'M11 6.5 A 8.5 8.5 0 0 1 11 17.5', o: 0.7 },
    { d: 'M14 4.5 A 12 12 0 0 1 14 19.5', o: 0.45 },
  ]
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${className}`} fill="none" aria-hidden="true">
      {arcs.map((a) => (
        <path key={a.d} d={a.d} stroke={color} strokeWidth="1.7" strokeLinecap="round" opacity={a.o} />
      ))}
    </svg>
  )
}

export function NetworkMark({ network, ink = '#fff' }) {
  const n = (network || '').toLowerCase()
  if (n === 'visa') {
    return <span className="text-lg font-bold italic tracking-wide" style={{ color: ink }}>VISA</span>
  }
  if (n === 'mastercard') {
    return (
      <span className="flex items-center" aria-label="Mastercard">
        <span className="h-5 w-5 rounded-full" style={{ background: '#EB001B' }} />
        <span className="-ml-2 h-5 w-5 rounded-full" style={{ background: '#F79E1B', opacity: 0.9 }} />
      </span>
    )
  }
  if (n === 'rupay') {
    return (
      <span className="text-base font-extrabold" style={{ color: ink }}>
        Ru<span style={{ color: '#F5A623' }}>Pay</span>
      </span>
    )
  }
  if (n === 'amex') {
    return <span className="rounded bg-white/15 px-1.5 py-0.5 text-xs font-bold tracking-wider" style={{ color: ink }}>AMEX</span>
  }
  return network ? <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: ink }}>{network}</span> : null
}

/** Decorative background pattern, absolutely positioned, very low contrast. */
export function CardPattern({ variant, ink = '#fff' }) {
  const uid = useId().replace(/[:]/g, '')
  const common = 'pointer-events-none absolute inset-0 overflow-hidden'
  if (variant === 'waves') {
    return (
      <svg className={common} preserveAspectRatio="none" viewBox="0 0 320 200" aria-hidden="true">
        {[0, 26, 52, 78].map((y) => (
          <path key={y} d={`M-20 ${120 + y} C 60 ${80 + y}, 120 ${170 + y}, 200 ${120 + y} S 340 ${90 + y}, 360 ${120 + y}`} fill="none" stroke={ink} strokeOpacity="0.10" strokeWidth="2" />
        ))}
      </svg>
    )
  }
  if (variant === 'flow') {
    return (
      <svg className={common} preserveAspectRatio="none" viewBox="0 0 320 200" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <path key={i} d={`M${-20 + i * 12} 210 C ${60 + i * 12} 120, ${140 + i * 8} 90, ${340} ${20 + i * 10}`} fill="none" stroke={ink} strokeOpacity="0.08" strokeWidth="1.5" />
        ))}
      </svg>
    )
  }
  if (variant === 'architecture') {
    return (
      <svg className={`${common} right-[-10%] top-1/2 -translate-y-1/2`} width="220" height="220" viewBox="0 0 120 120" aria-hidden="true">
        <g fill="none" stroke={ink} strokeOpacity="0.10" strokeWidth="2">
          <path d="M10 100 L60 40 L110 100 Z" />
          <path d="M22 100 V70 M38 100 V64 M54 100 V60 M70 100 V64 M86 100 V70" />
          <path d="M6 108 H114" />
        </g>
      </svg>
    )
  }
  if (variant === 'wallet') {
    return (
      <svg className={`${common}`} preserveAspectRatio="none" viewBox="0 0 320 200" aria-hidden="true">
        <g fill="none" stroke={ink} strokeOpacity="0.09" strokeWidth="2">
          <rect x="180" y="60" width="150" height="100" rx="12" />
          <rect x="196" y="86" width="150" height="100" rx="12" />
          <circle cx="300" cy="120" r="8" />
        </g>
      </svg>
    )
  }
  if (variant === 'blobs') {
    return (
      <svg className={common} preserveAspectRatio="none" viewBox="0 0 320 200" aria-hidden="true">
        <path d="M250 -20 C320 20 320 120 250 150 C190 175 150 120 190 70 C215 38 210 5 250 -20 Z" fill={ink} fillOpacity="0.10" />
        <path d="M40 150 C90 120 120 170 90 200 C60 225 10 200 20 170 Z" fill={ink} fillOpacity="0.07" />
      </svg>
    )
  }
  if (variant === 'dots') {
    return (
      <svg className={common} aria-hidden="true">
        <defs>
          <pattern id={`p-${uid}`} width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.4" fill={ink} fillOpacity="0.14" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#p-${uid})`} />
      </svg>
    )
  }
  // grid
  return (
    <svg className={common} aria-hidden="true">
      <defs>
        <pattern id={`p-${uid}`} width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0 H0 V26" fill="none" stroke={ink} strokeOpacity="0.09" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#p-${uid})`} />
    </svg>
  )
}

/** Glossy diagonal sheen that sweeps on hover (parent needs `group`). */
export function Sheen() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/18 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full"
    />
  )
}
