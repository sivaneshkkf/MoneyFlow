import { useState } from 'react'
import { format } from 'date-fns'
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import clsx from 'clsx'
import {
  BarChart3,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  PiggyBank,
  Percent,
  TrendingUp,
  TrendingDown,
  HandCoins,
  Wallet,
} from 'lucide-react'
import { PageContainer, Skeleton, ErrorState, EmptyState } from '../../components/common'
import { useAnalytics, ANALYTICS_RANGES } from './useAnalytics'
import { financialHealth } from '../../utils/health'
import { useDashboardMetrics } from '../dashboard/useDashboard'
import { formatCurrency } from '../../utils/format'

const tip = { contentStyle: { borderRadius: 12, border: '1px solid #E4E9E7', fontSize: 12, boxShadow: '0 8px 24px -12px rgba(0,0,0,0.2)' } }
const money = (v) => formatCurrency(v)
const compact = (n) => {
  const a = Math.abs(n)
  if (a >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`
  if (a >= 1e5) return `${(n / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `${Math.round(n / 1e3)}k`
  return `${n}`
}

function Delta({ pct, label = 'from last period', points }) {
  const zero = Math.abs(pct) < 0.05
  const up = pct >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <p className={clsx('mt-2 flex items-center gap-1 text-xs font-semibold', zero ? 'text-ink-soft' : up ? 'text-success' : 'text-danger')}>
      {!zero && <Icon className="h-3.5 w-3.5" />}
      {zero ? '—' : `${up ? '+' : ''}${pct.toFixed(1)}${points ? '%' : '%'}`}
      <span className="font-normal text-ink-soft">{label}</span>
    </p>
  )
}

const TINTS = {
  green: { card: 'border-success/20 bg-success/[0.06]', icon: 'bg-success/15 text-success', bar: '#22C55E' },
  rose: { card: 'border-danger/20 bg-danger/[0.06]', icon: 'bg-danger/15 text-danger', bar: '#EF4444' },
  violet: { card: 'border-[#8B5CF6]/20 bg-[#8B5CF6]/[0.06]', icon: 'bg-[#8B5CF6]/15 text-[#8B5CF6]', bar: '#8B5CF6' },
  blue: { card: 'border-info/20 bg-info/[0.06]', icon: 'bg-info/15 text-info', bar: '#3B82F6' },
  amber: { card: 'border-warning/20 bg-warning/[0.06]', icon: 'bg-warning/15 text-warning', bar: '#F59E0B' },
  teal: { card: 'border-brand-600/20 bg-brand-600/[0.06]', icon: 'bg-brand-600/15 text-brand-600', bar: '#2F6F63' },
}

function StatTile({ icon: Icon, tint, label, value, delta }) {
  return (
    <div className={`rounded-2xl border p-4 ${tint.card}`}>
      <div className="flex items-center gap-2.5">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${tint.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm text-ink-soft">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {delta}
    </div>
  )
}

function MiniTile({ icon: Icon, tint, label, value, foot, footTone }) {
  return (
    <div className={`rounded-2xl border p-4 ${tint.card}`}>
      <div className="flex items-center gap-2.5">
        <span className={`grid h-8 w-8 place-items-center rounded-xl ${tint.icon}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs text-ink-soft">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold tracking-tight">{value}</p>
      <p className={clsx('mt-0.5 text-xs', footTone || 'text-ink-soft')}>{foot}</p>
    </div>
  )
}

function ChartCard({ title, subtitle, right, children }) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-soft">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

function PeriodPill({ children = 'Last 3 months' }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-medium text-ink-soft dark:border-white/10">
      {children}
    </span>
  )
}

export default function AnalyticsPage() {
  const [range, setRange] = useState('3m')
  const { data, isLoading, isError, refetch } = useAnalytics(range)
  const { data: metrics } = useDashboardMetrics()

  const health = metrics
    ? financialHealth({
        income: metrics.income,
        expenses: metrics.expenses,
        savings: metrics.savings,
        netSavings: metrics.netSavings,
        overdue: metrics.overdue,
        receivable: metrics.receivable,
        balance: metrics.balance,
      })
    : null

  return (
    <PageContainer>
      {/* header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-success/12 text-success">
            <BarChart3 className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
            <p className="text-sm text-ink-soft">Trends across income, spending, savings, cash flow and lending.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line p-0.5 dark:border-white/10">
            {ANALYTICS_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={clsx(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition',
                  range === r.key ? 'bg-dark text-white dark:bg-brand-700' : 'text-ink-soft hover:bg-brand-50 dark:hover:bg-white/5',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {data && (
            <span className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-1.5 text-xs font-medium text-ink-soft dark:border-white/10">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(data.range.from), 'MMM dd, yyyy')}
              <span className="text-ink-soft">→</span>
              {format(new Date(data.range.to), 'MMM dd, yyyy')}
            </span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : isError ? (
        <ErrorState message="Unable to load analytics." onRetry={refetch} />
      ) : (
        <div className="space-y-5">
          {/* stat tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={ArrowUpRight}
              tint={TINTS.green}
              label="Income"
              value={money(data.income)}
              delta={<Delta pct={data.changes.income} />}
            />
            <StatTile
              icon={ArrowDownRight}
              tint={TINTS.rose}
              label="Expenses"
              value={money(data.expenses)}
              delta={<Delta pct={data.changes.expenses} />}
            />
            <StatTile
              icon={PiggyBank}
              tint={TINTS.violet}
              label="Net savings"
              value={money(data.netSavings)}
              delta={<Delta pct={data.changes.netSavings} />}
            />
            <StatTile
              icon={Percent}
              tint={TINTS.blue}
              label="Savings rate"
              value={`${data.savingsRate.toFixed(1)}%`}
              delta={<Delta pct={data.changes.savingsRate} points />}
            />
          </div>

          {/* cash flow */}
          <ChartCard title="Cash Flow" subtitle="Track your income and expenses over time." right={<PeriodPill>Monthly</PeriodPill>}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data.monthly} margin={{ left: -6, right: 8, top: 8 }}>
                  <defs>
                    <linearGradient id="an-in" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="an-out" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#EF4444" stopOpacity={0.24} />
                      <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E7" vertical={false} />
                  <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} width={48} tickFormatter={compact} />
                  <Tooltip formatter={(v, n) => [money(v), n === 'income' ? 'Income' : 'Expenses']} {...tip} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    formatter={(v) => (v === 'income' ? 'Income' : 'Expenses')}
                  />
                  <Area type="monotone" dataKey="income" stroke="#22C55E" strokeWidth={2.5} fill="url(#an-in)" dot={{ r: 3 }} />
                  <Area type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2.5} fill="url(#an-out)" dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* expense donut + income bars */}
          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Expense Analytics — by category" right={<PeriodPill />}>
              {data.expenseByCategory.length === 0 ? (
                <p className="py-12 text-center text-sm text-ink-soft">No expenses in this range</p>
              ) : (
                <div className="flex flex-col items-center gap-5 sm:flex-row">
                  <div className="relative h-44 w-44 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.expenseByCategory} dataKey="value" nameKey="name" innerRadius={54} outerRadius={82} paddingAngle={2}>
                          {data.expenseByCategory.map((c) => (
                            <Cell key={c.name} fill={c.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v, n) => [money(v), n]} {...tip} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[11px] text-ink-soft">Total Expenses</span>
                      <span className="text-lg font-bold">{money(data.expenses)}</span>
                    </div>
                  </div>
                  <ul className="min-w-0 flex-1 space-y-2">
                    {data.expenseByCategory.slice(0, 6).map((c) => (
                      <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="shrink-0">
                          <span className="font-semibold">{money(c.value)}</span>
                          <span className="ml-1.5 text-xs text-ink-soft">
                            {data.expenses > 0 ? ((c.value / data.expenses) * 100).toFixed(1) : 0}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </ChartCard>

            <ChartCard title="Income Analytics — by source" right={<PeriodPill />}>
              {data.incomeByCategory.length === 0 ? (
                <p className="py-12 text-center text-sm text-ink-soft">No income in this range</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.incomeByCategory.slice(0, 6)} layout="vertical" margin={{ left: 12, right: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E7" horizontal={false} />
                      <XAxis type="number" fontSize={11} tickLine={false} axisLine={false} tickFormatter={compact} />
                      <YAxis type="category" dataKey="name" fontSize={11} tickLine={false} axisLine={false} width={78} />
                      <Tooltip formatter={(v) => [money(v), 'Income']} {...tip} />
                      <Bar dataKey="value" fill="#1D5F4E" radius={[0, 6, 6, 0]} barSize={16}>
                        {data.incomeByCategory.slice(0, 6).map((c) => (
                          <Cell key={c.name} fill={c.color || '#1D5F4E'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          </div>

          {/* savings bars + lending line */}
          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Savings — income vs expense vs net" right={<PeriodPill />}>
              <div className="mb-2 flex gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Income</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-danger" />Expenses</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#8B5CF6]" />Net Savings</span>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthly} margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E7" vertical={false} />
                    <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
                    <Tooltip formatter={(v, n) => [money(v), n === 'income' ? 'Income' : n === 'expenses' ? 'Expenses' : 'Net']} {...tip} />
                    <Bar dataKey="income" fill="#22C55E" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" fill="#EF4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="net" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Lending Analytics — lent vs recovered" right={<PeriodPill />}>
              <div className="mb-2 flex gap-4 text-xs">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-info" />Lent</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success" />Recovered</span>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.monthly} margin={{ left: -10 }}>
                    <defs>
                      <linearGradient id="an-rec" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22C55E" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E7" vertical={false} />
                    <XAxis dataKey="month" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} tickLine={false} axisLine={false} width={44} tickFormatter={compact} />
                    <Tooltip formatter={(v, n) => [money(v), n === 'lent' ? 'Lent' : 'Recovered']} {...tip} />
                    <Area type="monotone" dataKey="recovered" stroke="#22C55E" strokeWidth={2.5} fill="url(#an-rec)" dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="lent" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* lending mini tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniTile
              icon={HandCoins}
              tint={TINTS.amber}
              label="Money lent (range)"
              value={money(data.moneyLent)}
              foot={data.moneyLent > 0 ? 'Principal lent this period' : 'No active lending this period'}
            />
            <MiniTile
              icon={Wallet}
              tint={TINTS.green}
              label="Principal recovered"
              value={money(data.principalReceived)}
              foot={
                data.changes.principalReceived
                  ? `${data.changes.principalReceived > 0 ? '↑ +' : ''}${data.changes.principalReceived.toFixed(0)}% from last period`
                  : '—'
              }
              footTone={data.changes.principalReceived > 0 ? 'text-success' : undefined}
            />
            <MiniTile
              icon={Percent}
              tint={TINTS.violet}
              label="Interest earned"
              value={money(data.interestReceived)}
              foot={data.interestReceived > 0 ? 'Counted as income' : 'No interest earned'}
            />
            <MiniTile
              icon={BarChart3}
              tint={TINTS.blue}
              label="Recovery rate"
              value={`${data.recoveryPct.toFixed(0)}%`}
              foot={data.recoveryPct > 0 ? 'of money lent recovered' : '— No recovery yet'}
            />
          </div>

          {/* financial health */}
          {health && (
            <div className="card p-5">
              <h2 className="mb-4 text-base font-semibold">Financial Health</h2>
              <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center">
                <div className="flex items-center gap-4">
                  <div
                    className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full"
                    style={{ background: `conic-gradient(#22C55E ${health.score * 3.6}deg, #E4E9E7 0deg)` }}
                  >
                    <div className="absolute inset-[6px] flex flex-col items-center justify-center rounded-full bg-white dark:bg-[#161F1D]">
                      <span className="text-2xl font-extrabold">{health.score}</span>
                      <span className="text-[10px] text-ink-soft">/100</span>
                    </div>
                  </div>
                  <div>
                    <span
                      className={clsx(
                        'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold',
                        health.tone === 'success'
                          ? 'bg-success/15 text-success'
                          : health.tone === 'warning'
                            ? 'bg-warning/15 text-warning'
                            : health.tone === 'danger'
                              ? 'bg-danger/15 text-danger'
                              : 'bg-info/15 text-info',
                      )}
                    >
                      {health.band}
                    </span>
                    <p className="mt-1.5 max-w-[16rem] text-sm text-ink-soft">
                      {health.score >= 80
                        ? "You're in a good position. Keep going!"
                        : health.score >= 60
                          ? 'Solid — a few areas to tighten up.'
                          : 'Some areas need attention.'}
                    </p>
                  </div>
                </div>

                <ul className="w-full flex-1 space-y-3">
                  {health.parts.map((p, i) => {
                    const color = ['#22C55E', '#3B82F6', '#8B5CF6', '#2F6F63'][i % 4]
                    return (
                      <li key={p.label}>
                        <div className="mb-1 flex justify-between text-xs">
                          <span className="text-ink-soft">{p.label}</span>
                          <span className="font-semibold">
                            {Math.round(p.points)}/{p.max}
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-brand-400/15 dark:bg-white/10">
                          <div className="h-full rounded-full" style={{ width: `${(p.points / p.max) * 100}%`, background: color }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
              <p className="mt-3 text-xs text-ink-soft">A rule-based indicator, not financial advice.</p>
            </div>
          )}

          {data.income === 0 && data.expenses === 0 && data.moneyLent === 0 && (
            <EmptyState icon={BarChart3} title="Nothing to analyze yet" description="Add transactions and lending activity to unlock insights." />
          )}
        </div>
      )}
    </PageContainer>
  )
}
