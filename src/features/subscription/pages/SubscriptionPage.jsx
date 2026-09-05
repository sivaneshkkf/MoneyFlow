import { useState } from 'react'
import { Link } from 'react-router-dom'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import {
  Sprout, Crown, Sparkles, ArrowUp, BarChart3, Landmark, Receipt, PieChart,
  CalendarClock, Users, Info, Check, X, ArrowRight, AlertTriangle, TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'
import { Skeleton, ErrorState, ProgressBar, Badge } from '../../../components/common'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import { useSubscription, usePlans } from '../hooks/useSubscription'
import { useSubscriptionLimits } from '../hooks/useSubscriptionLimits'
import { useSubscriptionMutations } from '../hooks/useSubscriptionMutations'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatCurrency, formatDate } from '../../../utils/format'
import { RESOURCE_LABEL, FEATURE_LABEL, STATUS_META, isUnlimited } from '../subscriptionMeta'
import CustomOfferCard from '../components/CustomOfferCard'
import { useMyCustomPlanOffer } from '../hooks/useCustomPlan'

const USAGE_ORDER = ['accounts', 'transactions_per_month', 'budgets', 'bills', 'lending_records']
const RESOURCE_ICON = {
  accounts: Landmark,
  transactions_per_month: Receipt,
  budgets: PieChart,
  bills: CalendarClock,
  lending_records: Users,
}

function UsageRow({ resource, usage }) {
  if (!usage) return null
  const Icon = RESOURCE_ICON[resource]
  const { used, limit_value: limit, unlimited } = usage
  const pct = unlimited || !limit ? 0 : Math.min(100, Math.round((used / limit) * 100))
  const nearLimit = !unlimited && limit > 0 && used / limit >= 0.8

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-success/10 text-success">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{RESOURCE_LABEL[resource]}</span>
          <span className="flex shrink-0 items-baseline gap-2">
            <span className={nearLimit ? 'font-semibold text-warning' : 'text-ink-soft'}>
              {used} / {unlimited ? 'Unlimited' : limit}
            </span>
            {!unlimited && <span className="w-9 text-right text-xs text-ink-soft">{pct}%</span>}
          </span>
        </div>
        {!unlimited && <ProgressBar value={pct} tone={pct >= 100 ? 'danger' : nearLimit ? 'warning' : 'success'} />}
      </div>
    </div>
  )
}

// Presence checklist for "Plan features": limit-backed rows always show (with
// their current cap), feature-flag rows only check when the plan enables them.
const CAPABILITY_ROWS = [
  { kind: 'always', label: 'Basic expense tracking' },
  { kind: 'limit', key: 'budgets', label: (v) => (isUnlimited(v) ? 'Unlimited budget planning' : `Budget planning (up to ${v} budgets)`) },
  { kind: 'limit', key: 'bills', label: (v) => (isUnlimited(v) ? 'Unlimited bill & recurring tracking' : `Bill & recurring tracking (up to ${v})`) },
  { kind: 'limit', key: 'lending_records', label: (v) => (isUnlimited(v) ? 'Unlimited lending management' : `Lending management (up to ${v} records)`) },
  { kind: 'always', label: 'Basic reports' },
  { kind: 'feature', key: 'advanced_analytics', label: FEATURE_LABEL.advanced_analytics },
  { kind: 'feature', key: 'csv_export', label: 'Export to PDF & CSV' },
  { kind: 'unlimited', label: 'Unlimited everything' },
]

export default function SubscriptionPage() {
  const { subscription, plan, isFree, isPro, isPastDue, isCancelling, features, limits, renewsOn, isLoading, isError, refetch } = useSubscription()
  const { usage, getUsage, isLoading: usageLoading } = useSubscriptionLimits()
  const { data: plans } = usePlans()
  const { data: customOffer } = useMyCustomPlanOffer()
  const { cancel, resume } = useSubscriptionMutations()
  const toast = useToast()
  const [confirmCancel, setConfirmCancel] = useState(false)

  const act = async (fn, msg) => {
    try {
      await fn()
      toast.success(msg)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (isError || !subscription) return <ErrorState message="Unable to load your subscription." onRetry={refetch} />

  const pro = plans?.find((p) => p.slug === 'pro')
  const proHighlights = pro
    ? [
        'Unlimited accounts, transactions & budgets',
        ...Object.entries(pro.features ?? {}).filter(([, on]) => on).map(([k]) => FEATURE_LABEL[k] ?? k),
      ].slice(0, 5)
    : []

  const statusMeta = STATUS_META[subscription.status] ?? STATUS_META.active
  const periodStart = subscription.current_period_start ? new Date(subscription.current_period_start) : startOfMonth(new Date())
  const periodEnd = subscription.current_period_end ? new Date(subscription.current_period_end) : endOfMonth(new Date())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-success/[0.08] via-success/[0.03] to-white p-6 dark:border-white/10 dark:to-[#161F1D] sm:p-8">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.14), transparent 70%)' }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Subscription</h1>
            <p className="mt-1 max-w-md text-sm text-ink-soft">
              Manage your plan, usage and explore more features to get the most out of MoneyFlow.
            </p>
          </div>
          <div className="hidden items-start gap-3 sm:flex">
            <div className="text-right">
              <p className="text-sm font-bold leading-snug">
                Take control of
                <br />
                your financial future
              </p>
              <p className="mt-0.5 max-w-[14rem] text-xs text-ink-soft">Upgrade to Pro for a richer, smarter experience.</p>
            </div>
            <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-success shadow-sm dark:bg-white/10">
              <TrendingUp className="h-5 w-5" />
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Left column */}
        <div className="space-y-6">
          <div className="card relative overflow-hidden p-6">
            <Crown className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 text-brand-400/10" aria-hidden="true" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
                  <Sprout className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink-soft">Current Plan</p>
                  <p className="text-2xl font-extrabold uppercase tracking-tight">{plan?.name}</p>
                  <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                </div>
              </div>
              {isPro && (
                <div className="text-right">
                  <p className="text-lg font-bold">
                    {formatCurrency(subscription.billing_cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly)}
                    <span className="text-xs font-normal text-ink-soft">/{subscription.billing_cycle === 'yearly' ? 'year' : 'month'}</span>
                  </p>
                  {renewsOn && (
                    <p className="text-xs text-ink-soft">
                      {isCancelling ? 'Access ends' : 'Renews'} {formatDate(renewsOn)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="relative mt-3 text-sm text-ink-soft">
              {isFree
                ? "Great to have you onboard! You're using the Free plan."
                : "You're enjoying full access with MoneyFlow Pro."}
            </p>

            {isPastDue && (
              <div className="relative mt-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/[0.07] p-3 text-sm dark:bg-warning/10">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>Your last payment didn&apos;t go through. We&apos;ll keep retrying automatically.</span>
              </div>
            )}
            {isCancelling && isPro && (
              <div className="relative mt-4 rounded-xl bg-brand-50 p-3 text-sm dark:bg-white/5">
                Your subscription is set to cancel on <b>{formatDate(renewsOn)}</b>. You&apos;ll keep Pro access until then.
              </div>
            )}

            <div className="relative mt-5 flex flex-wrap gap-2">
              {isFree && (
                <Link to="/pricing" className="btn-primary">
                  <ArrowUp className="h-4 w-4" /> Upgrade to Pro
                </Link>
              )}
              <Link to="/pricing" className="btn-ghost border border-line dark:border-white/10">
                <BarChart3 className="h-4 w-4" /> Compare Plans
              </Link>
              {isPro && !isCancelling && subscription.status !== 'expired' && subscription.status !== 'cancelled' && (
                <button className="btn-ghost border border-line dark:border-white/10" onClick={() => setConfirmCancel(true)}>
                  Cancel subscription
                </button>
              )}
              {isPro && isCancelling && (
                <button
                  className="btn-primary"
                  onClick={() => act(() => resume.mutateAsync(), 'Subscription resumed. Welcome back to Pro!')}
                  disabled={resume.isPending}
                >
                  {resume.isPending ? 'Resuming…' : 'Keep Pro'}
                </button>
              )}
            </div>
          </div>

          <div className="card p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
                  <CalendarClock className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold">Usage this period</h2>
                  <p className="text-xs text-ink-soft">Your current usage for this billing period.</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-soft">Billing period</p>
                <p className="text-sm font-semibold">
                  {format(periodStart, 'MMM d')} – {format(periodEnd, 'MMM d, yyyy')}
                </p>
              </div>
            </div>

            {usageLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : usage.length === 0 ? (
              <p className="text-sm text-ink-soft">Usage data is unavailable right now.</p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                {USAGE_ORDER.map((resource) => (
                  <UsageRow key={resource} resource={resource} usage={getUsage(resource)} />
                ))}
              </div>
            )}

            {isFree && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-success/[0.07] p-3 text-sm dark:bg-success/10">
                <span className="flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0 text-success" /> Need higher limits? Upgrade to Pro and remove all limits.
                </span>
                <Link to="/pricing" className="btn-ghost !py-1.5 border border-line text-xs dark:border-white/10">
                  View All Plans
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {customOffer && !['declined', 'rejected', 'cancelled'].includes(customOffer.status) && (
            <CustomOfferCard offer={customOffer} />
          )}
          {isFree ? (
            <div className="card relative overflow-hidden p-6">
              <TrendingUp className="pointer-events-none absolute -right-6 bottom-0 h-28 w-28 text-success/10" aria-hidden="true" />
              <div className="relative flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning">
                  <Crown className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold">Unlock more with Pro</h2>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    Get advanced features, higher limits and a more powerful financial experience.
                  </p>
                </div>
              </div>
              <ul className="relative mt-4 space-y-2">
                {proHighlights.map((f) => (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                    {f}
                  </li>
                ))}
                <li className="text-sm text-ink-soft">And much more…</li>
              </ul>
              <Link to="/pricing" className="btn-primary relative mt-5 w-full justify-center">
                Upgrade to Pro <ArrowRight className="h-4 w-4" />
              </Link>
              <p className="relative mt-3 text-center text-xs text-ink-soft">Plan for a brighter tomorrow.</p>
            </div>
          ) : (
            <div className="card p-6 text-center">
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-dark to-brand-700 text-white">
                <Sparkles className="h-5 w-5" />
              </span>
              <h2 className="mt-3 text-base font-bold">You&apos;re on Pro ✦</h2>
              <p className="mt-1 text-sm text-ink-soft">Every advanced feature and unlimited usage is unlocked.</p>
            </div>
          )}

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold">Plan features</h2>
                  <p className="text-xs text-ink-soft">What&apos;s included in your current plan.</p>
                </div>
              </div>
              <Link to="/pricing" className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400 sm:inline-flex">
                View all features <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="space-y-2.5">
              {CAPABILITY_ROWS.map((row) => {
                const included =
                  row.kind === 'always'
                    ? true
                    : row.kind === 'feature'
                      ? Boolean(features?.[row.key])
                      : row.kind === 'unlimited'
                        ? Object.values(limits ?? {}).every((v) => isUnlimited(v))
                        : true // limit rows always show, just worded differently
                const label = row.kind === 'limit' ? row.label(limits?.[row.key]) : row.label
                return (
                  <li key={label} className={clsx('flex items-center gap-2.5 text-sm', !included && 'text-ink-soft/70')}>
                    <span
                      className={clsx(
                        'grid h-4 w-4 shrink-0 place-items-center rounded-full',
                        included ? 'bg-success/15 text-success' : 'bg-ink-soft/10 text-ink-soft/60',
                      )}
                    >
                      {included ? <Check className="h-2.5 w-2.5" strokeWidth={3} /> : <X className="h-2.5 w-2.5" strokeWidth={3} />}
                    </span>
                    {label}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => act(() => cancel.mutateAsync(), 'Subscription cancelled.').then(() => setConfirmCancel(false))}
        title="Cancel your Pro subscription?"
        message="Your Pro benefits will remain active until the end of your current billing period."
        confirmLabel="Cancel subscription"
        loading={cancel.isPending}
      />
    </div>
  )
}
