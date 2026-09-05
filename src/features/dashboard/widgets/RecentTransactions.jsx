import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Receipt } from 'lucide-react'
import { SectionHeader, Skeleton, EmptyState, Badge } from '../../../components/common'
import { formatCurrency, formatFriendlyDate } from '../../../utils/format'
import { useRecentTransactions } from '../../transactions/useTransactions'

export default function RecentTransactions() {
  const { data: rows, isLoading } = useRecentTransactions(7)

  return (
    <div className="card p-5">
      <SectionHeader
        title="Recent Transactions"
        action={
          <Link to="/transactions" className="text-xs font-medium text-brand-700 hover:underline">
            View all
          </Link>
        }
      />
      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : !rows || rows.length === 0 ? (
        <EmptyState icon={Receipt} title="No transactions yet" description="Your latest activity will show here." />
      ) : (
        <ul className="divide-y divide-line dark:divide-white/5">
          {rows.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <span
                className={`rounded-lg p-1.5 ${
                  t.type === 'income' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                }`}
              >
                {t.type === 'income' ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.description || 'Untitled'}</p>
                <p className="truncate text-xs text-ink-soft">
                  {t.category?.name || '—'} · {formatFriendlyDate(t.transaction_date)}
                  {t.account?.name ? ` · ${t.account.name}` : ''}
                </p>
              </div>
              {t.source === 'lending_interest' && <Badge tone="info">Interest</Badge>}
              <span className={`text-sm font-semibold ${t.type === 'income' ? 'text-success' : 'text-danger'}`}>
                {t.type === 'income' ? '+' : '-'}
                {formatCurrency(t.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
