import { useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts'
import { Users, Sparkles, Wallet, UserPlus, ArrowRight } from 'lucide-react'
import { Skeleton, ErrorState } from '../../../components/common'
import AdminStatCard from '../components/AdminStatCard'
import { useAdminDashboard, useAdminGrowth } from '../hooks/useAdminAnalytics'
import { useAdminAuditLogs } from '../hooks/useAdminAuditLogs'
import { auditActionMeta } from '../adminMeta'
import { formatCurrency, formatRelative } from '../../../utils/format'
import { useAuth } from '../../auth/AuthProvider'
import { useProfile } from '../../settings/useProfile'

const PERIODS = [
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
  { key: 365, label: '12 months' },
]

export default function AdminDashboardPage() {
  const { data: stats, isLoading, isError, refetch } = useAdminDashboard()
  const [days, setDays] = useState(30)
  const { userGrowth, subscriptionGrowth, isLoading: growthLoading } = useAdminGrowth(days)
  const { data: recentLogs } = useAdminAuditLogs({ limit: 6, offset: 0 })
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = (profile?.full_name || user?.email || 'Admin').split(' ')[0]

  if (isError) return <ErrorState message="Unable to load the admin dashboard." onRetry={refetch} />

  const mrrAvailable = Boolean(stats && (stats.mrr > 0 || stats.pro_users > 0))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-ink-soft">Here&apos;s what&apos;s happening with MoneyFlow.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <AdminStatCard title="Total Users" amount={stats.total_users.toLocaleString('en-IN')} icon={Users} />
          <AdminStatCard title="Pro Users" amount={stats.pro_users.toLocaleString('en-IN')} icon={Sparkles} tone="success" />
          <AdminStatCard title="Free Users" amount={stats.free_users.toLocaleString('en-IN')} icon={Users} />
          <AdminStatCard
            title="Active Subscriptions"
            amount={stats.active_subscriptions.toLocaleString('en-IN')}
            icon={Sparkles}
            hint={`${stats.trialing_subscriptions} trialing · ${stats.past_due_subscriptions} past due`}
          />
          <AdminStatCard
            title="Monthly Recurring Revenue"
            amount={formatCurrency(stats.mrr)}
            icon={Wallet}
            unavailable={!mrrAvailable}
            unavailableHint="No paid subscriptions yet"
          />
          <AdminStatCard title="Annual Run Rate" amount={formatCurrency(stats.arr)} icon={Wallet} unavailable={!mrrAvailable} unavailableHint="No paid subscriptions yet" />
          <AdminStatCard title="New Users (7d)" amount={`+${stats.new_users_7d}`} icon={UserPlus} tone={stats.new_users_7d > 0 ? 'success' : 'neutral'} />
          <AdminStatCard title="Cancelled Subscriptions" amount={stats.cancelled_subscriptions.toLocaleString('en-IN')} icon={Sparkles} tone={stats.cancelled_subscriptions > 0 ? 'danger' : 'neutral'} />
        </div>
      )}

      <div className="flex items-center justify-end gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setDays(p.key)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              days === p.key ? 'bg-dark text-white dark:bg-brand-700' : 'bg-brand-50 text-ink-soft hover:bg-brand-100 dark:bg-white/5'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold">User Growth</h2>
          {growthLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={userGrowth}>
                <defs>
                  <linearGradient id="adminUserGrowth" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2F6F63" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2F6F63" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E7" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(d) => format(new Date(d), 'dd MMM')} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} width={28} />
                <Tooltip labelFormatter={(d) => format(new Date(d), 'dd MMM yyyy')} />
                <Area type="monotone" dataKey="new_users" name="New users" stroke="#2F6F63" fill="url(#adminUserGrowth)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold">Subscription Activity</h2>
          {growthLoading ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={subscriptionGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E9E7" vertical={false} />
                <XAxis dataKey="day" tickFormatter={(d) => format(new Date(d), 'dd MMM')} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis allowDecimals={false} fontSize={11} tickLine={false} axisLine={false} width={28} />
                <Tooltip labelFormatter={(d) => format(new Date(d), 'dd MMM yyyy')} />
                <Bar dataKey="new_pro" name="Upgrades" fill="#2F6F63" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cancelled" name="Cancellations" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold">Recent Admin Activity</h2>
          <Link to="/admin/audit-logs" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        {!recentLogs || recentLogs.rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-soft">No admin activity yet.</p>
        ) : (
          <ul className="divide-y divide-line dark:divide-white/5">
            {recentLogs.rows.map((log) => {
              const meta = auditActionMeta(log.action)
              return (
                <li key={log.log_id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400">
                    <meta.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {meta.label}
                    {log.target_email && <span className="text-ink-soft"> · {log.target_email}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">{formatRelative(log.created_at)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
