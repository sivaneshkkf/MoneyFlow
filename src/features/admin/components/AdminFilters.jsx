import { Search } from 'lucide-react'
import { Select } from '../../../components/common/form'

/**
 * Shared search + select-filter bar for admin list pages.
 * filters: [{ key, value, onChange(value), options: [{ value, label }] }]
 */
export default function AdminFilters({ search, onSearchChange, searchPlaceholder = 'Search…', filters = [] }) {
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
      <div className="flex flex-wrap gap-2">
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
      </div>
    </div>
  )
}
