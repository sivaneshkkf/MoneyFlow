import { useState } from 'react'
import { Link } from 'react-router-dom'
import { startOfMonth, endOfMonth, format, differenceInCalendarDays } from 'date-fns'
import {
  Sprout, Crown, Sparkles, ArrowUp, BarChart3, Landmark, Receipt, PieChart,
  CalendarClock, Users, Info, Check, X, ArrowRight, AlertTriangle, TrendingUp,
  CreditCard, Clock, ListChecks, HelpCircle,
} from 'lucide-react'
import clsx from 'clsx'
import { Skeleton, ErrorState, Badge } from '../../../components/common'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import { useSubscription, usePlans, useBillingHistory } from '../hooks/useSubscription'
import { useSubscriptionLimits } from '../hooks/useSubscriptionLimits'
import { useSubscriptionMutations } from '../hooks/useSubscriptionMutations'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatCurrency, formatDate } from '../../../utils/format'
import { RESOURCE_LABEL, FEATURE_LABEL, STATUS_META, isUnlimited } from '../subscriptionMeta'
import CustomOfferCard from '../components/CustomOfferCard'
import { useMyCustomPlanOffer } from '../hooks/useCustomPlan'

const USAGE_ORDER = ['accounts', 'transactions_per_month', 'bills', 'budgets', 'lending_records']
const RESOURCE_ICON = {
  accounts: Landmark,
  transactions_per_month: Receipt,
  budgets: PieChart,
  bills: CalendarClock,
  lending_records: Users,
}
const RESOURCE_ICON_STYLE = {
  accounts: 'bg-ink-soft/10 text-ink-soft',
  transactions_per_month: 'bg-info/10 text-info',
  bills: 'bg-success/12 text-success',
  budgets: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  lending_records: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
}

function UsageBox({ resource, usage }) {
  if (!usage) return null
  const Icon = RESOURCE_ICON[resource]
  const { used, limit_value: limit, unlimited } = usage
  const pct = unlimited || !limit ? 100 : Math.min(100, Math.round((used / limit) * 100))
  const nearLimit = !unlimited && limit > 0 && used / limit >= 0.8

  return (
    <div className="rounded-xl border border-line p-3.5 dark:border-white/10">
      <div className="flex items-center gap-2.5">
        <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', RESOURCE_ICON_STYLE[resource])}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-sm font-medium">{RESOURCE_LABEL[resource]}</span>
      </div>
      <p className="mt-2.5 text-sm">
        <span className={clsx('font-semibold', nearLimit && 'text-warning')}>{used}</span>
        <span className="text-ink-soft"> / {unlimited ? 'Unlimited' : limit}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-brand-400/15 dark:bg-white/10">
        <div
          className={clsx('h-full rounded-full', !unlimited && pct >= 100 ? 'bg-danger' : nearLimit ? 'bg-warning' : 'bg-success')}
          style={{ width: `${pct}%` }}
        />
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
  const { data: billingHistory, isLoading: historyLoading } = useBillingHistory()
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

  const isCustom = plan?.slug === 'custom'
  const isPaid = isPro || isCustom
  // A custom subscriber's real price lives on their custom_plan_requests row
  // (the shared marker plan they're linked to always prices at 0) — same
  // resolution the admin views and the pricing page's CustomOfferCard use.
  const customActiveOffer = customOffer?.status === 'active' ? customOffer : null
  const cycle = subscription.billing_cycle === 'yearly' ? 'yearly' : 'monthly'
  const displayPrice = isCustom
    ? (customActiveOffer ? Number(customActiveOffer.admin_price) : null)
    : cycle === 'yearly' ? plan?.priceYearly : plan?.priceMonthly
  const priceCycle = isCustom && customActiveOffer ? (customActiveOffer.billing_cycle === 'yearly' ? 'year' : 'month') : cycle === 'yearly' ? 'year' : 'month'

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
  const periodTotalDays = Math.max(1, differenceInCalendarDays(periodEnd, periodStart))
  const periodElapsedDays = Math.min(periodTotalDays, Math.max(0, differenceInCalendarDays(new Date(), periodStart)))
  const periodPct = Math.round((periodElapsedDays / periodTotalDays) * 100)
  const daysLeft = Math.max(0, differenceInCalendarDays(periodEnd, new Date()))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">Subscription &amp; Billing</h1>
        <p className="mt-1 text-sm text-ink-soft">Manage your plan, usage, and billing details.</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Left column */}
        <div className="space-y-6">
          <div
            className={clsx(
              'card relative overflow-hidden p-6',
              isCustom && 'border-violet-300/60 bg-gradient-to-b from-violet-50/60 to-white dark:border-violet-400/20 dark:from-violet-500/10 dark:to-transparent',
            )}
          >
            {!isCustom && <Crown className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 text-brand-400/10" aria-hidden="true" />}
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span
                  className={clsx(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                    isCustom ? 'bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-400' : 'bg-success/12 text-success',
                  )}
                >
                  {isCustom ? <Sparkles className="h-5 w-5" /> : <Sprout className="h-5 w-5" />}
                </span>
                <div>
                  <p className="text-xs font-semibold text-ink-soft">Current Plan</p>
                  <p className="text-2xl font-extrabold tracking-tight">{plan?.name}</p>
                  {isCustom ? (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                      <Check className="h-3 w-3" strokeWidth={3} /> Current Plan
                    </span>
                  ) : (
                    <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                  )}
                </div>
              </div>
              {isPaid && displayPrice != null && (
                <div className="text-right">
                  <p className="text-lg font-bold">
                    {formatCurrency(displayPrice)}
                    <span className="text-xs font-normal text-ink-soft">/{priceCycle}</span>
                  </p>
                  {renewsOn && (
                    <p className="text-xs text-ink-soft">
                      {isCancelling ? 'Access ends' : 'Renews on'} {formatDate(renewsOn)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <p className="relative mt-3 text-sm text-ink-soft">
              {isFree
                ? "Great to have you onboard! You're using the Free plan."
                : isCustom
                  ? 'Tailored for you. Flexible pricing based on your needs.'
                  : "You're enjoying full access with MoneyFlow Pro."}
            </p>

            {isPastDue && (
              <div className="relative mt-4 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/[0.07] p-3 text-sm dark:bg-warning/10">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>Your last payment didn&apos;t go through. We&apos;ll keep retrying automatically.</span>
              </div>
            )}
            {isCancelling && isPaid && (
              <div className="relative mt-4 rounded-xl bg-brand-50 p-3 text-sm dark:bg-white/5">
                Your subscription is set to cancel on <b>{formatDate(renewsOn)}</b>. You&apos;ll keep {plan?.name} access until then.
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
              {isPaid && !isCancelling && subscription.status !== 'expired' && subscription.status !== 'cancelled' && (
                <button className="btn-ghost border border-line dark:border-white/10" onClick={() => setConfirmCancel(true)}>
                  Cancel subscription
                </button>
              )}
              {isPaid && isCancelling && (
                <button
                  className="btn-primary"
                  onClick={() => act(() => resume.mutateAsync(), `Subscription resumed. Welcome back to ${plan?.name}!`)}
                  disabled={resume.isPending}
                >
                  {resume.isPending ? 'Resuming…' : `Keep ${plan?.name}`}
                </button>
              )}
            </div>
          </div>

          <div className="card p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
                  <BarChart3 className="h-5 w-5" />
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
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-brand-400/15 dark:bg-white/10">
                    <div className="h-full rounded-full bg-success" style={{ width: `${periodPct}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-[11px] text-ink-soft">{daysLeft} days left</span>
                </div>
              </div>
            </div>

            {usageLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : usage.length === 0 ? (
              <p className="text-sm text-ink-soft">Usage data is unavailable right now.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                {USAGE_ORDER.map((resource) => (
                  <UsageBox key={resource} resource={resource} usage={getUsage(resource)} />
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

          {isPaid && (
            <div className="card p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-400">
                    <Receipt className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-bold">Billing information</h2>
                    <p className="text-xs text-ink-soft">Your next payment and billing details.</p>
                  </div>
                </div>
                <button
                  className="btn-ghost border border-line dark:border-white/10"
                  onClick={() => toast.info('Your payment method is managed securely by Razorpay — contact support if you need to update it.')}
                >
                  <CreditCard className="h-4 w-4" /> Update payment method
                </button>
              </div>
              <dl className="text-sm">
                {[
                  ['Plan', plan?.name],
                  ['Price', displayPrice != null ? `${formatCurrency(displayPrice)} / ${priceCycle}` : '—'],
                  ['Next billing date', renewsOn ? formatDate(renewsOn) : '—'],
                  ['Payment method', 'Razorpay (UPI / Card / Netbanking)'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 py-2">
                    <dt className="text-ink-soft">{label}</dt>
                    <dd className="font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {isPaid && (
            <div className="card p-6">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-info/10 text-info">
                  <Clock className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-base font-bold">Billing history</h2>
                  <p className="text-xs text-ink-soft">View your past payments.</p>
                </div>
              </div>
              {historyLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : !billingHistory?.length ? (
                <p className="text-sm text-ink-soft">No billing history yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-soft dark:border-white/10">
                        <th className="pb-2 pr-4 font-semibold">Date</th>
                        <th className="pb-2 pr-4 font-semibold">Description</th>
                        <th className="pb-2 pr-4 font-semibold">Amount</th>
                        <th className="pb-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line dark:divide-white/5">
                      {billingHistory.map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap py-2.5 pr-4">{formatDate(row.date)}</td>
                          <td className="py-2.5 pr-4">{row.description}</td>
                          <td className="py-2.5 pr-4 font-medium">{row.amount != null ? formatCurrency(row.amount) : '—'}</td>
                          <td className="py-2.5">
                            <Badge tone="success">Paid</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-success/12 text-success">
                <Crown className="h-5 w-5" />
              </span>
              <h2 className="mt-3 text-base font-bold">You&apos;re on {plan?.name} Plan ✦</h2>
              <p className="mt-1 text-sm text-ink-soft">Every advanced feature and unlimited usage is unlocked.</p>
            </div>
          )}

          <div className="card p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
                  <ListChecks className="h-5 w-5" />
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
                    {included ? (
                      <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={2.5} />
                    ) : (
                      <X className="h-4 w-4 shrink-0 text-ink-soft/40" strokeWidth={2.5} />
                    )}
                    {label}
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="card p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-info/10 text-info">
                <HelpCircle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-bold">Need help?</h2>
                <p className="mt-0.5 text-sm text-ink-soft">Have questions about your plan or billing?</p>
              </div>
            </div>
            <Link to="/contact" className="btn-ghost mt-4 w-full justify-center border border-line dark:border-white/10">
              Contact support
            </Link>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => act(() => cancel.mutateAsync(), 'Subscription cancelled.').then(() => setConfirmCancel(false))}
        title={`Cancel your ${plan?.name} subscription?`}
        message={`Your ${plan?.name} benefits will remain active until the end of your current billing period.`}
        confirmLabel="Cancel subscription"
        loading={cancel.isPending}
      />
    </div>
  )
}
