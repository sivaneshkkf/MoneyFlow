import { Search, RotateCcw } from 'lucide-react'
import { Select } from '../../../components/common/form'

/**
 * Shared search + select-filter bar for admin list pages.
 * filters: [{ key, value, onChange(value), options: [{ value, label }] }]
 * onClear (optional): resets search + every filter to its default (usually
 * the first option, "All") — the button only shows when something is
 * actually set, so callers don't need to compute that themselves.
 */
export default function AdminFilters({ search, onSearchChange, searchPlaceholder = 'Search…', filters = [], onClear }) {
  const hasActive = Boolean(search) || filters.some((f) => f.value && f.value !== f.options?.[0]?.value)

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      {onSearchChange && (
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            className="input pl-9 text-sm"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Select
            key={f.key}
            className="!w-auto min-w-[9.5rem]"
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ))}
        {onClear && hasActive && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-sm text-ink-soft transition hover:bg-brand-50 hover:text-ink dark:border-white/10 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>
    </div>
  )
}
