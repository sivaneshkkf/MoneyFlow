import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Skeleton, EmptyState, ErrorState } from '../../../components/common'
import { friendlyError } from '../../../utils/errors'
import { PAGE_SIZE } from '../adminMeta'

/**
 * Generic admin list surface: a real <table> from sm and up, stacked cards
 * below it, one column definition shared by both — used by Users,
 * Subscriptions, Payments and Audit Logs so none of those pages hand-roll
 * table markup or pagination twice.
 *
 * columns: [{ key, header, render(row), primary?: bool, className? }]
 */
export default function AdminDataTable({
  columns, rows, loading, error, onRetry, emptyIcon, emptyTitle = 'Nothing to show', emptyDescription,
  page = 0, pageSize = PAGE_SIZE, total = 0, onPageChange, rowKey = (r) => r.id, onRowClick,
}) {
  const primary = columns.find((c) => c.primary) ?? columns[0]
  const rest = columns.filter((c) => c !== primary)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (loading) return <Skeleton className="h-72 w-full" />
  // A failed fetch must never render as "nothing found" — that hides real
  // problems (RLS, a missing migration, a network error) behind a
  // misleadingly normal-looking empty state.
  if (error) {
    return <ErrorState message={friendlyError(error, 'Unable to load this data.')} onRetry={onRetry} />
  }
  if (!rows || rows.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="card overflow-hidden p-0">
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-soft dark:border-white/10">
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-semibold ${c.className ?? ''}`}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line dark:divide-white/5">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? 'cursor-pointer transition hover:bg-brand-50/60 dark:hover:bg-white/5' : ''}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-line sm:hidden dark:divide-white/5">
        {rows.map((row) => (
          <li
            key={rowKey(row)}
            className={`p-4 ${onRowClick ? 'cursor-pointer active:bg-brand-50/60 dark:active:bg-white/5' : ''}`}
            onClick={() => onRowClick?.(row)}
          >
            <div className="mb-2 text-sm font-semibold">{primary.render ? primary.render(row) : row[primary.key]}</div>
            <dl className="space-y-1.5">
              {rest.map((c) => (
                <div key={c.key} className="flex items-center justify-between gap-3 text-xs">
                  <dt className="text-ink-soft">{c.header}</dt>
                  <dd>{c.render ? c.render(row) : row[c.key]}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>

      {onPageChange && totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-soft dark:border-white/10">
          <span>
            Page {page + 1} of {totalPages} · {total} total
          </span>
          <div className="flex gap-1.5">
            <button
              className="rounded-lg border border-line p-1.5 disabled:opacity-40 dark:border-white/10"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              className="rounded-lg border border-line p-1.5 disabled:opacity-40 dark:border-white/10"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
