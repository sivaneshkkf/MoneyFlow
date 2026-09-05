import { Wallet, TrendingUp, TrendingDown, Landmark, HandCoins, ArrowDownLeft, CreditCard } from 'lucide-react'
import { StatCard, CardSkeleton } from '../../../components/common'
import { formatCurrency } from '../../../utils/format'
import { useDashboardMetrics } from '../useDashboard'

const TIP = {
  available:
    'Money currently available across your active bank, cash and wallet accounts. Credit card debt and lending receivables are excluded.',
  netWorth: 'Available cash + outstanding receivables − credit card debt.',
  debt: 'Outstanding amount currently owed on active credit cards.',
  receivable: "Money you've lent that has not yet been repaid.",
}

export default function MetricCards() {
  const { data, isLoading } = useDashboardMetrics()

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  }

  const cards = [
    {
      title: 'Available Balance',
      amount: formatCurrency(data.availableBalance),
      icon: Wallet,
      hint: 'Across cash, bank and wallets',
      info: TIP.available,
    },
    {
      title: 'Income',
      amount: formatCurrency(data.income),
      icon: TrendingUp,
      change: data.changes.income,
    },
    {
      title: 'Expenses',
      amount: formatCurrency(data.expenses),
      icon: TrendingDown,
      change: data.changes.expenses,
    },
    {
      title: 'Net Worth',
      amount: formatCurrency(data.netWorth),
      icon: Landmark,
      hint: 'Assets minus card debt',
      info: TIP.netWorth,
    },
    {
      title: 'Money Lent',
      amount: formatCurrency(data.moneyLent),
      icon: HandCoins,
      hint: 'Lifetime principal lent',
    },
    {
      title: 'Receivable',
      amount: formatCurrency(data.receivable),
      icon: ArrowDownLeft,
      hint: 'Outstanding from borrowers',
      info: TIP.receivable,
    },
    {
      title: 'Credit Card Debt',
      amount: formatCurrency(data.creditCardDebt),
      icon: CreditCard,
      tone: 'danger',
      hint: 'Outstanding across active cards',
      info: TIP.debt,
    },
    {
      title: 'Savings Pot',
      amount: formatCurrency(data.goalSavings),
      icon: Wallet,
      hint: 'Saved toward goals',
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <StatCard key={c.title} {...c} comparison="vs last month" />
      ))}
    </div>
  )
}
