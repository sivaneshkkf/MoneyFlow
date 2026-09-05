import { Link } from 'react-router-dom'
import { Target } from 'lucide-react'
import { SectionHeader, Skeleton, EmptyState, ProgressBar } from '../../../components/common'
import { formatCurrency } from '../../../utils/format'
import { useDashboardGoals } from '../useDashboard'

export default function SavingsGoalsWidget() {
  const { data: goals, isLoading } = useDashboardGoals()

  return (
    <div className="card p-5">
      <SectionHeader
        title="Savings Goals"
        action={
          <Link to="/goals" className="text-xs font-medium text-brand-700 hover:underline">
            View all
          </Link>
        }
      />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !goals || goals.length === 0 ? (
        <EmptyState icon={Target} title="No savings goals yet" description="Create a goal to start saving with intent." />
      ) : (
        <ul className="space-y-4">
          {goals.map((g) => {
            const pct = Math.min(100, (Number(g.current_amount) / Number(g.target_amount)) * 100)
            return (
              <li key={g.id}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-ink-soft">
                    {formatCurrency(g.current_amount)} / {formatCurrency(g.target_amount)}
                  </span>
                </div>
                <ProgressBar value={pct} tone={pct >= 100 ? 'success' : 'neutral'} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
