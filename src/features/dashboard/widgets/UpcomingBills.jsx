import { Link } from 'react-router-dom'
import { CalendarClock, Plus } from 'lucide-react'
import { SectionHeader, Skeleton, EmptyState } from '../../../components/common'
import CategoryIcon from '../../../components/categories/CategoryIcon'
import { formatCurrency } from '../../../utils/format'
import { useUpcomingBills } from '../../bills/useBills'
import { kindMeta, occurrenceDueLabel } from '../../bills/billMeta'

export default function UpcomingBills() {
  const { data: rows, isLoading } = useUpcomingBills(6)

  return (
    <div className="card p-5">
      <SectionHeader
        title="Upcoming Bills"
        action={
          <Link to="/bills" className="text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400">
            View all
          </Link>
        }
      />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No upcoming bills"
          description="Bills, EMIs and subscriptions you schedule will appear here."
          action={
            <Link to="/bills" className="btn-primary !py-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add a payment
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {rows.slice(0, 6).map((o) => {
            const meta = kindMeta(o.kind)
            const cat = o.recurring?.category
            const due = occurrenceDueLabel(o.due_date, o.status)
            return (
              <li key={o.id}>
                <Link
                  to={`/bills/${o.recurringId}`}
                  className="flex items-center gap-3 rounded-xl px-1 py-1.5 transition hover:bg-brand-50/60 dark:hover:bg-white/5"
                >
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{ background: `${cat?.color ?? meta.color}1f`, color: cat?.color ?? meta.color }}
                  >
                    {cat?.icon ? <CategoryIcon name={cat.icon} size={18} /> : <meta.icon className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{o.name}</p>
                    <p className="text-xs text-ink-soft">{formatCurrency(o.scheduled_amount)}</p>
                  </div>
                  {due && (
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        due.tone === 'danger'
                          ? 'bg-danger/12 text-danger'
                          : due.tone === 'warning'
                            ? 'bg-warning/15 text-warning'
                            : 'bg-info/10 text-info'
                      }`}
                    >
                      {due.text}
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
