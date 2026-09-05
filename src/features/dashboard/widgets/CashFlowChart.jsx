import { useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import clsx from 'clsx'
import { SectionHeader } from '../../../components/common'
import { Skeleton } from '../../../components/common'
import { formatCurrency } from '../../../utils/format'
import { useCashFlow, RANGE_OPTIONS } from '../useDashboard'

const compact = (n) => {
  const abs = Math.abs(n)
  if (abs >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`
  if (abs >= 1e5) return `${(n / 1e5).toFixed(1)}L`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(0)}k`
  return `${n}`
}

export default function CashFlowChart() {
  const [range, setRange] = useState('30d')
  const [chartType, setChartType] = useState('area')
  const { data = [], isLoading } = useCashFlow(range)

  const totals = data.reduce(
    (acc, d) => ({
      income: acc.income + d.income,
      expenses: acc.expenses + d.expenses,
      net: acc.net + d.net,
    }),
    { income: 0, expenses: 0, net: 0 },
  )

  return (
    <div className="card p-5">
      <SectionHeader
        title="Cash Flow"
        action={
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={clsx(
                  'rounded-lg px-2 py-1 text-xs font-medium transition',
                  range === r.key ? 'bg-dark text-white dark:bg-brand-700' : 'text-ink-soft hover:bg-brand-50 dark:hover:bg-white/5',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <span className="text-ink-soft">
          Income <b className="text-success">{formatCurrency(totals.income)}</b>
        </span>
        <span className="text-ink-soft">
          Expenses <b className="text-danger">{formatCurrency(totals.expenses)}</b>
        </span>
        <span className="text-ink-soft">
          Net <b className={totals.net >= 0 ? 'text-success' : 'text-danger'}>{formatCurrency(totals.net)}</b>
        </span>
        <button
          className="ml-auto text-xs font-medium text-brand-700 hover:underline"
          onClick={() => setChartType((t) => (t === 'area' ? 'line' : 'area'))}
        >
          {chartType === 'area' ? 'Line view' : 'Area view'}
        </button>
      </div>

      {isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="h-72" role="img" aria-label={`Cash flow for the last ${range}. Net ${formatCurrency(totals.net)}.`}>
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'area' ? (
              <AreaChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="cfIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2F6F63" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#2F6F63" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E7" vertical={false} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
                <Tooltip
                  formatter={(v, n) => [formatCurrency(v), labels[n] ?? n]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #E4E9E7', fontSize: 12 }}
                />
                <Area type="monotone" dataKey="net" stroke="#2F6F63" strokeWidth={2} fill="url(#cfIncome)" />
              </AreaChart>
            ) : (
              <LineChart data={data} margin={{ left: -12, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E7" vertical={false} />
                <XAxis dataKey="label" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
                <Tooltip
                  formatter={(v, n) => [formatCurrency(v), labels[n] ?? n]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #E4E9E7', fontSize: 12 }}
                />
                <Line type="monotone" dataKey="income" stroke="#22C55E" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="net" stroke="#2F6F63" strokeWidth={2} dot={false} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

const labels = {
  income: 'Income',
  expenses: 'Expenses',
  moneyLent: 'Money Lent',
  principalReceived: 'Principal Received',
  interestReceived: 'Interest Received',
  net: 'Net Cash Flow',
}
