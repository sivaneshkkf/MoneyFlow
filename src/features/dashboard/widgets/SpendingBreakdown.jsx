import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import clsx from 'clsx'
import { SectionHeader, Skeleton, EmptyState } from '../../../components/common'
import { PieChart as PieIcon } from 'lucide-react'
import { formatCurrency } from '../../../utils/format'
import { useSpendingBreakdown } from '../useDashboard'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function SpendingBreakdown() {
  const [view, setView] = useState('donut')
  const { data, isLoading } = useSpendingBreakdown()

  return (
    <div className="card p-5">
      <SectionHeader
        title="Spending Breakdown"
        action={
          <div className="flex gap-1">
            {['donut', 'heatmap'].map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={clsx(
                  'rounded-lg px-2 py-1 text-xs font-medium capitalize transition',
                  view === v ? 'bg-dark text-white dark:bg-brand-700' : 'text-ink-soft hover:bg-brand-50 dark:hover:bg-white/5',
                )}
              >
                {v}
              </button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : !data || data.categories.length === 0 ? (
        <EmptyState icon={PieIcon} title="No spending this month" description="Add expenses to see the breakdown." />
      ) : view === 'donut' ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative h-56 w-56 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.categories} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2}>
                  {data.categories.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, n) => [formatCurrency(v), n]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #E4E9E7', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-ink-soft">This month</span>
              <span className="text-lg font-bold">{formatCurrency(data.total)}</span>
            </div>
          </div>
          <ul className="flex-1 space-y-1.5">
            {data.categories.slice(0, 7).map((c) => (
              <li key={c.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                  {c.name}
                </span>
                <span className="font-medium">
                  {formatCurrency(c.value)}
                  <span className="ml-1 text-xs text-ink-soft">
                    {Math.round((c.value / data.total) * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-ink-soft">
                <th className="py-1 text-left font-medium">Category</th>
                {DOW.map((day) => (
                  <th key={day} className="px-1 py-1 text-center font-medium">
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.heatmap.map((row) => (
                <tr key={row.name}>
                  <td className="whitespace-nowrap py-1 pr-2 font-medium">{row.name}</td>
                  {row.cells.map((amt, i) => {
                    const intensity = amt / data.maxCell
                    return (
                      <td key={i} className="p-0.5">
                        <div
                          className="mx-auto h-7 w-7 rounded-md"
                          title={`${row.name} · ${DOW[i]} · ${formatCurrency(amt)}`}
                          style={{
                            background:
                              amt === 0 ? 'var(--hm-empty, #EEF2F1)' : `rgba(47,111,99,${0.15 + intensity * 0.85})`,
                          }}
                          aria-label={`${row.name}, ${DOW[i]}, ${formatCurrency(amt)}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-soft">Darker cells indicate higher spending on that weekday this month.</p>
        </div>
      )}
    </div>
  )
}
