import { Lightbulb } from 'lucide-react'
import { SectionHeader, Skeleton } from '../../../components/common'
import { formatCurrency } from '../../../utils/format'
import { useDashboardMetrics, useUpcomingRepayments } from '../useDashboard'

// Rule-based insights derived from live figures — no ML, no advice.
function buildInsights(m, repayments) {
  const out = []
  if (m.changes.expenses > 10) {
    out.push({ tone: 'warning', text: `Your expenses are up ${m.changes.expenses.toFixed(0)}% vs last month.` })
  } else if (m.changes.expenses < -10) {
    out.push({ tone: 'success', text: `Nice — expenses are down ${Math.abs(m.changes.expenses).toFixed(0)}% vs last month.` })
  }
  if (m.changes.savings > 5) {
    out.push({ tone: 'success', text: `Your savings improved by ${m.changes.savings.toFixed(0)}% this month.` })
  }
  if (m.savingsRate >= 20) {
    out.push({ tone: 'success', text: `You're saving ${m.savingsRate.toFixed(0)}% of your income this month.` })
  } else if (m.income > 0 && m.savingsRate < 10) {
    out.push({ tone: 'warning', text: `Your savings rate is ${m.savingsRate.toFixed(0)}% — aim for 20%+.` })
  }
  if (m.receivable > 0) {
    out.push({ tone: 'info', text: `You have ${formatCurrency(m.receivable)} outstanding from lending.` })
  }
  const overdueCount = (repayments ?? []).filter((r) => r.status === 'overdue').length
  if (overdueCount > 0) {
    out.push({ tone: 'danger', text: `${overdueCount} lending record${overdueCount > 1 ? 's are' : ' is'} overdue.` })
  }
  if (m.interestEarned > 0) {
    out.push({ tone: 'success', text: `You've earned ${formatCurrency(m.interestEarned)} in lending interest.` })
  }
  if (m.moneyLent > 0 && m.cashFlow < 0) {
    out.push({ tone: 'info', text: 'Your cash balance dipped this month partly due to lending activity.' })
  }
  return out.slice(0, 5)
}

const toneClass = {
  success: 'border-success/30 bg-success/5',
  warning: 'border-warning/30 bg-warning/5',
  danger: 'border-danger/30 bg-danger/5',
  info: 'border-info/30 bg-info/5',
}

export default function Insights() {
  const { data: m, isLoading } = useDashboardMetrics()
  const { data: repayments } = useUpcomingRepayments()

  if (isLoading || !m) return <div className="card p-5"><Skeleton className="h-40 w-full" /></div>
  const insights = buildInsights(m, repayments)
  if (insights.length === 0) return null

  return (
    <div className="card p-5">
      <SectionHeader title="Financial Insights" />
      <ul className="space-y-2">
        {insights.map((i, idx) => (
          <li key={idx} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${toneClass[i.tone]}`}>
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
            {i.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
