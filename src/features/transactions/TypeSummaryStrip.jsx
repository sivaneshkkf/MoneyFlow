import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Calendar, BarChart3, Star, TrendingUp, TrendingDown, PieChart as PieIcon } from 'lucide-react'
import { CardSkeleton, InfoDot } from '../../components/common'
import { Select } from '../../components/common/form'
import { useTypeSummary } from './useTypeSummary'
import { formatCurrency } from '../../utils/format'

const compact = (n) => {
  const abs = Math.abs(n)
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(1)}Cr`
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  if (abs >= 1e3) return `₹${Math.round(n / 1e3)}K`
  return `₹${n}`
}

function Delta({ pct, suffix }) {
  const zero = Math.abs(pct) < 0.05
  const up = pct >= 0
  const Icon = zero ? null : up ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        zero ? 'text-ink-soft' : up ? 'text-success' : 'text-danger'
      }`}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : '—'}
      {zero ? '0%' : `${up ? '+' : ''}${pct.toFixed(1)}%`}
      <span className="font-normal text-ink-soft">{suffix}</span>
    </span>
  )
}

function StatTile({ icon: Icon, iconTint, cardTint = '', label, children }) {
  return (
    <div className={`card p-4 ${cardTint}`}>
      <div className="flex items-center gap-2.5">
        <span className={`grid h-9 w-9 place-items-center rounded-xl ${iconTint}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm text-ink-soft">{label}</span>
      </div>
      {children}
    </div>
  )
}

/** floating value badge on the last bar */
function LastBarLabel(accent) {
  return function Label({ x, y, width, value, index, dataLength }) {
    if (index !== dataLength - 1 || !value) return null
    const cx = x + width / 2
    const text = formatCurrency(value)
    const w = Math.max(52, text.length * 7 + 14)
    return (
      <g>
        <rect x={cx - w / 2} y={y - 26} width={w} height={20} rx={6} fill={accent} />
        <text x={cx} y={y - 12} textAnchor="middle" fill="#fff" fontSize={11} fontWeight={700}>
          {text}
        </text>
      </g>
    )
  }
}

export default function TypeSummaryStrip({ type }) {
  const { data, isLoading } = useTypeSummary(type)
  const [donutPeriod, setDonutPeriod] = useState('month')
  const label = type === 'income' ? 'Income' : 'Expenses'
  const accent = type === 'income' ? '#22C55E' : '#EF4444'
  const softTint = type === 'income' ? 'bg-success/[0.06] border-success/20' : 'bg-danger/[0.06] border-danger/20'

  if (isLoading || !data) {
    return (
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    )
  }

  const donutCats = donutPeriod === 'month' ? data.categoriesThisMonth : data.categories
  const donutTotal = donutCats.reduce((s, c) => s + c.value, 0)
  const topSource = data.topCategory
  const topPct = data.allTime > 0 && topSource ? Math.round((topSource.value / data.allTime) * 100) : 0

  return (
    <div className="mb-6 space-y-4">
      {/* --- stat tiles --- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Calendar} iconTint="bg-success/15 text-success" label={`This month's ${label.toLowerCase()}`}>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              <p className="text-2xl font-bold tracking-tight">{formatCurrency(data.thisMonth)}</p>
              <div className="mt-1">
                <Delta pct={data.change} suffix="vs last month" />
              </div>
            </div>
            <div className="h-12 w-24 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.months}>
                  <defs>
                    <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={2} fill="url(#spark)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </StatTile>

        <StatTile icon={Calendar} iconTint="bg-info/15 text-info" label="Last month">
          <p className="mt-2 text-2xl font-bold tracking-tight">{formatCurrency(data.lastMonth)}</p>
          <div className="mt-1">
            <Delta pct={data.changeVsPrior} suffix="vs prior month" />
          </div>
        </StatTile>

        <StatTile icon={BarChart3} iconTint="bg-[#8B5CF6]/15 text-[#8B5CF6]" label="Last 12 months">
          <p className="mt-2 text-2xl font-bold tracking-tight">{formatCurrency(data.allTime)}</p>
          <p className="mt-1 text-xs text-ink-soft">Total {label.toLowerCase()}</p>
        </StatTile>

        <StatTile
          icon={Star}
          iconTint="bg-warning/15 text-warning"
          cardTint="!border-warning/25 !bg-warning/[0.06]"
          label={type === 'income' ? 'Top source' : 'Top category'}
        >
          <p className="mt-2 truncate text-2xl font-bold tracking-tight">{topSource ? topSource.name : '—'}</p>
          <p className="mt-1 text-xs">
            <span className="font-semibold text-warning">{topPct}%</span>{' '}
            <span className="text-ink-soft">of total {label.toLowerCase()}</span>
          </p>
        </StatTile>
      </div>

      {/* --- charts --- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">{label} trend (12 months)</p>
            <Select value="monthly" onChange={() => {}} className="w-28">
              <option value="monthly">Monthly</option>
            </Select>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.months} margin={{ top: 24, left: -8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E7" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} tickFormatter={compact} />
                <Tooltip
                  formatter={(v) => [formatCurrency(v), label]}
                  contentStyle={{ borderRadius: 12, border: '1px solid #E4E9E7', fontSize: 12 }}
                />
                <Bar
                  dataKey="value"
                  fill={accent}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={34}
                  label={(p) => LastBarLabel(accent)({ ...p, dataLength: data.months.length })}
                />
                <Line type="monotone" dataKey="value" stroke={accent} strokeWidth={2} dot={{ r: 3, fill: accent }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="h-2 w-2 rounded-full" style={{ background: accent }} /> {label}
          </p>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">By {type === 'income' ? 'source' : 'category'}</p>
            <Select value={donutPeriod} onChange={(e) => setDonutPeriod(e.target.value)} className="w-32">
              <option value="month">This month</option>
              <option value="year">Last 12 months</option>
            </Select>
          </div>

          {donutCats.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-soft">No {label.toLowerCase()} in this period</p>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutCats} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={2}>
                        {donutCats.map((c) => (
                          <Cell key={c.name} fill={c.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, n) => [formatCurrency(v), n]}
                        contentStyle={{ borderRadius: 12, border: '1px solid #E4E9E7', fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="min-w-0 flex-1 space-y-1.5">
                  {donutCats.slice(0, 4).map((c) => (
                    <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="font-medium">{formatCurrency(c.value)}</span>
                        <span className="ml-1 text-xs" style={{ color: c.color }}>
                          {donutTotal > 0 ? Math.round((c.value / donutTotal) * 100) : 0}%
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-xs ${softTint}`}>
                <PieIcon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: accent }} />
                <span>
                  <b>
                    {donutCats.length} {type === 'income' ? 'income source' : 'spending categor'}
                    {type === 'income' ? (donutCats.length === 1 ? '' : 's') : donutCats.length === 1 ? 'y' : 'ies'}
                  </b>{' '}
                  {type === 'income'
                    ? 'Diversify your income sources for better financial stability.'
                    : "Watch your largest categories to keep spending on track."}
                  {type !== 'income' && <InfoDot text="Based on this period's expense transactions." />}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
