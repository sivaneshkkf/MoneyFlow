import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { SectionHeader, Skeleton, EmptyState } from '../../../components/common'
import { formatCurrency, dueLabel } from '../../../utils/format'
import { useUpcomingRepayments } from '../useDashboard'

const AVATAR_COLORS = ['#8B5CF6', '#2F6F63', '#3B82F6', '#F59E0B', '#EC4899', '#0EA5E9']
const avatarColor = (name = '') => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export default function UpcomingRepayments() {
  const { data: rows, isLoading } = useUpcomingRepayments()

  return (
    <div className="card p-5">
      <SectionHeader title="Upcoming Repayments" />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Nothing due" description="Repayments with due dates will appear here." />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const overdue = r.overdueCount > 0
            const due = dueLabel(r.nextDue)
            const badgeText = overdue
              ? `${r.overdueCount} installment${r.overdueCount === 1 ? '' : 's'} overdue`
              : due?.text
            return (
              <li key={r.id}>
                <Link
                  to={`/lending/${r.id}`}
                  className="flex items-center gap-3 rounded-xl px-1 py-1.5 transition hover:bg-brand-50/60 dark:hover:bg-white/5"
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                    style={{ background: avatarColor(r.borrower_name) }}
                  >
                    {(r.borrower_name || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{r.borrower_name}</p>
                    <p className="text-xs text-ink-soft">
                      {formatCurrency(overdue ? r.overdueAmount : r.nextDueAmount || r.outstanding)} due
                    </p>
                  </div>
                  {badgeText && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        overdue
                          ? 'bg-danger/12 text-danger'
                          : due?.tone === 'warning'
                            ? 'bg-warning/15 text-warning'
                            : 'bg-info/10 text-info'
                      }`}
                    >
                      {badgeText}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
