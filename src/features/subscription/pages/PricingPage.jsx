import { useMemo, useState } from 'react'
import { Check, Minus } from 'lucide-react'
import clsx from 'clsx'
import { PageContainer, Skeleton, ErrorState } from '../../../components/common'
import { usePlans, useSubscription } from '../hooks/useSubscription'
import { useSubscriptionMutations } from '../hooks/useSubscriptionMutations'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import PricingCard from '../components/PricingCard'
import CustomOfferCard from '../components/CustomOfferCard'
import { useMyCustomPlanOffer } from '../hooks/useCustomPlan'
import { isUnlimited, RESOURCE_LABEL, FEATURE_LABEL } from '../subscriptionMeta'

const COMPARISON_ROWS = [
  { key: 'accounts', kind: 'limit' },
  { key: 'transactions_per_month', kind: 'limit' },
  { key: 'budgets', kind: 'limit' },
  { key: 'bills', kind: 'limit' },
  { key: 'lending_records', kind: 'limit' },
  { key: 'advanced_analytics', kind: 'feature' },
  { key: 'advanced_reports', kind: 'feature' },
  { key: 'pdf_reports', kind: 'feature' },
  { key: 'csv_export', kind: 'feature' },
  { key: 'financial_insights', kind: 'feature' },
]

function ComparisonCell({ plan, row }) {
  if (row.kind === 'feature') {
    const on = Boolean(plan.features?.[row.key])
    return on ? (
      <Check className="mx-auto h-4 w-4 text-success" />
    ) : (
      <Minus className="mx-auto h-4 w-4 text-ink-soft/40" />
    )
  }
  const v = plan.limits?.[row.key]
  return <span className="text-sm font-medium">{isUnlimited(v) ? 'Unlimited' : v}</span>
}

export default function PricingPage() {
  const { data: plans, isLoading, isError, refetch } = usePlans()
  const { plan: currentPlan, isPro } = useSubscription()
  const { data: customOffer } = useMyCustomPlanOffer()
  const { checkout } = useSubscriptionMutations()
  const toast = useToast()
  const [billingCycle, setBillingCycle] = useState('monthly')

  const free = plans?.find((p) => p.slug === 'free')
  const pro = plans?.find((p) => p.slug === 'pro')

  const savingsPct = useMemo(() => {
    if (!pro || Number(pro.price_monthly) <= 0) return 0
    const yearlyAtMonthlyRate = Number(pro.price_monthly) * 12
    return Math.round(((yearlyAtMonthlyRate - Number(pro.price_yearly)) / yearlyAtMonthlyRate) * 100)
  }, [pro])

  const onSelectPro = async () => {
    try {
      const res = await checkout.mutateAsync({ planSlug: 'pro', billingCycle })
      if (res.status === 'redirect' && res.url) {
        window.location.href = res.url
        return
      }
      toast.info(res.message ?? 'Payments are not set up yet.')
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to start checkout right now.'))
    }
  }

  if (isLoading) {
    return (
      <PageContainer>
        <Skeleton className="h-96 w-full" />
      </PageContainer>
    )
  }
  if (isError || !free || !pro) {
    return (
      <PageContainer>
        <ErrorState message="Unable to load pricing right now." onRetry={refetch} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Choose the plan that fits your financial journey</h1>
        <p className="mt-2 text-sm text-ink-soft sm:text-base">Start free and upgrade when you need more powerful tools.</p>
      </div>

      <div className="mt-6 flex items-center justify-center gap-2">
        <div className="inline-flex rounded-xl border border-line bg-white p-1 dark:border-white/10 dark:bg-white/5">
          {[
            { key: 'monthly', label: 'Monthly' },
            { key: 'yearly', label: 'Yearly' },
          ].map((o) => (
            <button
              key={o.key}
              onClick={() => setBillingCycle(o.key)}
              className={clsx(
                'rounded-lg px-4 py-1.5 text-sm font-semibold transition',
                billingCycle === o.key ? 'bg-dark text-white dark:bg-brand-700' : 'text-ink-soft hover:text-ink',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {billingCycle === 'yearly' && savingsPct > 0 && (
          <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Save ~{savingsPct}%</span>
        )}
      </div>

      <div className="mx-auto mt-8 grid max-w-3xl gap-6 sm:grid-cols-2">
        <PricingCard plan={free} billingCycle={billingCycle} isCurrent={!isPro} onSelect={() => {}} />
        <PricingCard
          plan={pro}
          billingCycle={billingCycle}
          isCurrent={isPro}
          loading={checkout.isPending}
          onSelect={onSelectPro}
        />
      </div>

      <div className="mx-auto mt-8 max-w-md">
        <CustomOfferCard offer={customOffer} />
      </div>

      <div className="mx-auto mt-14 max-w-3xl">
        <h2 className="mb-4 text-center text-lg font-bold">Compare plans</h2>
        <div className="card overflow-hidden p-0">
          <div className="grid grid-cols-[1fr_72px_72px] items-center gap-2 border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-soft dark:border-white/10 sm:grid-cols-[1fr_100px_100px]">
            <span>Feature</span>
            <span className="text-center">Free</span>
            <span className="text-center">Pro</span>
          </div>
          {COMPARISON_ROWS.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_72px_72px] items-center gap-2 border-b border-line px-4 py-3 last:border-b-0 dark:border-white/5 sm:grid-cols-[1fr_100px_100px]"
            >
              <span className="text-sm">{row.kind === 'feature' ? FEATURE_LABEL[row.key] : RESOURCE_LABEL[row.key]}</span>
              <span className="text-center"><ComparisonCell plan={free} row={row} /></span>
              <span className="text-center"><ComparisonCell plan={pro} row={row} /></span>
            </div>
          ))}
        </div>
      </div>

      {currentPlan && (
        <p className="mt-8 text-center text-xs text-ink-soft">
          You&apos;re currently on the <b>{currentPlan.name}</b> plan.
        </p>
      )}
    </PageContainer>
  )
}
