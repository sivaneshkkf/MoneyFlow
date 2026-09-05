import { resolveIcon } from '../../components/categories/categoryIcons'

// Category name → coarse group label (mirrors the default seed categories).
const GROUPS = {
  Housing: 'Essentials',
  Food: 'Essentials',
  Bills: 'Essentials',
  Healthcare: 'Essentials',
  Transportation: 'Lifestyle',
  Shopping: 'Lifestyle',
  Entertainment: 'Lifestyle',
  Education: 'Growth',
  Other: 'General',
}
export const categoryGroup = (name) => GROUPS[name] ?? 'General'

/** Render a category icon by its stored Lucide name; falls back to MoreHorizontal. */
export function CategoryGlyph({ name, className = 'h-5 w-5' }) {
  const Icon = resolveIcon(name)
  return <Icon className={className} />
}

/** Circular progress ring with a centred percentage. */
export function RingProgress({ pct, tone = 'success', size = 56 }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color =
    tone === 'danger' ? '#EF4444' : tone === 'warning' ? '#F59E0B' : '#2F6F63'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-brand-400/20" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-bold" style={{ color }}>
        {Math.round(pct)}%
      </span>
    </div>
  )
}
