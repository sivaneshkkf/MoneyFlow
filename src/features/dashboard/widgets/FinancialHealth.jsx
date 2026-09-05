import { SectionHeader, Skeleton, Badge, ProgressBar } from '../../../components/common'
import { useDashboardMetrics } from '../useDashboard'
import { financialHealth } from '../../../utils/health'

export default function FinancialHealth() {
  const { data, isLoading } = useDashboardMetrics()

  if (isLoading || !data) return <div className="card p-5"><Skeleton className="h-64 w-full" /></div>

  const h = financialHealth({
    income: data.income,
    expenses: data.expenses,
    savings: data.savings,
    netSavings: data.netSavings,
    overdue: data.overdue,
    receivable: data.receivable,
    balance: data.balance,
  })

  const ring = `conic-gradient(#2F6F63 ${h.score * 3.6}deg, #E4E9E7 0deg)`

  return (
    <div className="card p-5">
      <SectionHeader title="Financial Health" action={<Badge tone={h.tone}>{h.band}</Badge>} />
      <div className="flex items-center gap-4">
        <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: ring }}>
          <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-white dark:bg-[#161F1D]">
            <span className="text-2xl font-bold">{h.score}</span>
            <span className="text-[10px] text-ink-soft">/ 100</span>
          </div>
        </div>
        <p className="text-sm text-ink-soft">
          Based on your savings rate ({h.savingsRate.toFixed(0)}%), emergency buffer, expense control and
          lending health. Not financial advice.
        </p>
      </div>
      <ul className="mt-4 space-y-2.5">
        {h.parts.map((p) => (
          <li key={p.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-ink-soft">{p.label}</span>
              <span className="font-medium">
                {Math.round(p.points)}/{p.max}
              </span>
            </div>
            <ProgressBar value={(p.points / p.max) * 100} tone="neutral" />
          </li>
        ))}
      </ul>
    </div>
  )
}
