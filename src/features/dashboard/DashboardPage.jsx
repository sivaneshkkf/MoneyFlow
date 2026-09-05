import { useState } from 'react'
import { format } from 'date-fns'
import { Link } from 'react-router-dom'
import { Plus, TrendingDown, TrendingUp, HandCoins, Target, PiggyBank } from 'lucide-react'
import { PageContainer, Skeleton } from '../../components/common'
import Modal from '../../components/common/Modal'
import TransactionForm from '../transactions/TransactionForm'
import { useProfile } from '../settings/useProfile'
import { formatCurrency } from '../../utils/format'
import { useDashboardMetrics } from './useDashboard'
import MetricCards from './widgets/MetricCards'
import CashFlowChart from './widgets/CashFlowChart'
import FinancialHealth from './widgets/FinancialHealth'
import SpendingBreakdown from './widgets/SpendingBreakdown'
import LendingOverview from './widgets/LendingOverview'
import SavingsGoalsWidget from './widgets/SavingsGoalsWidget'
import RecentTransactions from './widgets/RecentTransactions'
import UpcomingRepayments from './widgets/UpcomingRepayments'
import UpcomingBills from './widgets/UpcomingBills'
import MoneyFlowSection from './widgets/MoneyFlowSection'
import Insights from './widgets/Insights'
import FreePlanNudge from '../subscription/components/FreePlanNudge'

const quickActions = [
  { label: 'Add Expense', type: 'expense', icon: TrendingDown },
  { label: 'Add Income', type: 'income', icon: TrendingUp },
]

export default function DashboardPage() {
  const { data: profile } = useProfile()
  const { data: metrics, isLoading } = useDashboardMetrics()
  const firstName = (profile?.full_name || 'there').split(' ')[0]
  const [quickAdd, setQuickAdd] = useState(null) // null | 'expense' | 'income'

  return (
    <PageContainer>
      <section className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-dark to-brand-700 p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-white/60">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Hey, {firstName}</h1>
            <p className="mt-1 text-sm text-white/70">Here&apos;s your financial overview.</p>
          </div>
          <button className="btn bg-white/15 text-white hover:bg-white/25" onClick={() => setQuickAdd('expense')}>
            <Plus className="h-4 w-4" /> Quick add
          </button>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-white/50">Available balance</p>
            {isLoading || !metrics ? (
              <Skeleton className="mt-1 h-10 w-48 bg-white/10" />
            ) : (
              <>
                <p className="mt-1 text-4xl font-extrabold tracking-tight">
                  {formatCurrency(metrics.availableBalance)}
                </p>
                <p className="mt-1 text-xs text-white/55">
                  Net worth {formatCurrency(metrics.netWorth)}
                  {metrics.creditCardDebt > 0 && ` · Card debt ${formatCurrency(metrics.creditCardDebt)}`}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map((a) => (
              <button
                key={a.type}
                className="btn bg-white/10 text-sm text-white hover:bg-white/20"
                onClick={() => setQuickAdd(a.type)}
              >
                <a.icon className="h-4 w-4" /> {a.label}
              </button>
            ))}
            <Link to="/lending/given" className="btn bg-white/10 text-sm text-white hover:bg-white/20">
              <HandCoins className="h-4 w-4" /> Lend
            </Link>
            <Link to="/budgets" className="btn bg-white/10 text-sm text-white hover:bg-white/20">
              <PiggyBank className="h-4 w-4" /> Budget
            </Link>
            <Link to="/goals" className="btn bg-white/10 text-sm text-white hover:bg-white/20">
              <Target className="h-4 w-4" /> Goal
            </Link>
          </div>
        </div>
      </section>

      <FreePlanNudge />
      <MetricCards />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CashFlowChart />
        </div>
        <FinancialHealth />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SpendingBreakdown />
        <LendingOverview />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UpcomingBills />
        <UpcomingRepayments />
      </div>

      <div className="mt-6">
        <SavingsGoalsWidget />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MoneyFlowSection />
        <Insights />
      </div>

      <div className="mt-6">
        <RecentTransactions />
      </div>

      <Modal
        open={Boolean(quickAdd)}
        onClose={() => setQuickAdd(null)}
        title={quickAdd === 'income' ? 'Add income' : 'Add expense'}
      >
        <TransactionForm lockedType={quickAdd || 'expense'} onDone={() => setQuickAdd(null)} />
      </Modal>
    </PageContainer>
  )
}
