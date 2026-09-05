import { ArrowDown } from 'lucide-react'
import { SectionHeader, Skeleton } from '../../../components/common'
import { formatCurrency } from '../../../utils/format'
import { useDashboardMetrics } from '../useDashboard'

export default function MoneyFlowSection() {
  const { data, isLoading } = useDashboardMetrics()
  if (isLoading || !data) return <div className="card p-5"><Skeleton className="h-56 w-full" /></div>

  // Cash flow for THIS month only (income − expenses − money lent this month
  // + principal repaid this month). Not clamped — it can be negative.
  const lentThisMonth = data.monthMoneyLent ?? 0
  const principalBack = data.monthPrincipalReceived ?? 0
  const cashLeft = data.income - data.expenses - lentThisMonth + principalBack
  const steps = [
    { label: 'Income', value: data.income, tone: 'bg-success/10 text-success' },
    { label: 'Expenses', value: -data.expenses, tone: 'bg-danger/10 text-danger' },
    ...(lentThisMonth > 0
      ? [{ label: 'Money Lent', value: -lentThisMonth, tone: 'bg-warning/10 text-warning' }]
      : []),
    ...(principalBack > 0
      ? [{ label: 'Repayments received', value: principalBack, tone: 'bg-info/10 text-info' }]
      : []),
    {
      label: 'Cash left this month',
      value: cashLeft,
      tone: 'bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400',
    },
  ]

  return (
    <div className="card p-5">
      <SectionHeader title="Where did my money go?" />
      <p className="mb-4 text-sm text-ink-soft">This month&apos;s cash movement, step by step.</p>
      <div className="flex flex-col gap-2">
        {steps.map((s, i) => (
          <div key={s.label}>
            <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${s.tone}`}>
              <span className="text-sm font-medium">{s.label}</span>
              <span className="text-sm font-bold">
                {s.value < 0 ? '−' : ''}
                {formatCurrency(Math.abs(s.value))}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="flex justify-center py-0.5 text-ink-soft">
                <ArrowDown className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink-soft">
        Money lent isn&apos;t an expense — it moves cash into receivables ({formatCurrency(data.receivable)} outstanding).
      </p>
    </div>
  )
}
