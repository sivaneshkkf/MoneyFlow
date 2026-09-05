import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, Minus, ShieldCheck, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { PageContainer, Skeleton, ErrorState } from '../../../components/common'
import Seo from '../../../components/common/Seo'
import { useAuth } from '../../auth/AuthProvider'
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

const FAQ = [
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes. You can cancel any time from Settings → Subscription. Cancelling stops future renewals — you keep your Pro or Custom plan access until the end of the billing period you\'ve already paid for.',
  },
  {
    q: 'Can I change plans?',
    a: 'You can upgrade to Pro whenever you like. To move back from Pro to Free, cancel your subscription — your account reverts to Free once the current billing period ends.',
  },
  {
    q: 'How does billing work?',
    a: 'Paid plans bill automatically on a monthly or yearly cycle, whichever you choose at checkout, through our payment partner Razorpay.',
  },
  {
    q: 'What happens if my payment fails?',
    a: 'Your subscription is marked past due and we (or Razorpay) will retry the payment. If it keeps failing, your plan may be paused until payment succeeds or you cancel.',
  },
  {
    q: 'Can I request a custom plan?',
    a: 'Yes — if Free and Pro don\'t quite fit, use "Request a Quote" below to tell us what you need. We\'ll get back to you with an offer, and you can negotiate the details with our team before accepting.',
  },
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
  const { user } = useAuth()
  const navigate = useNavigate()
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
    if (!user) {
      navigate('/register')
      return
    }
    try {
      const res = await checkout.mutateAsync({ planSlug: 'pro', billingCycle })
      if (res.status === 'checkout') return
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
      <Seo
        title="Pricing"
        description="Explore MoneyFlow plans and choose the right subscription for your financial tracking needs."
      />

      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Simple pricing for better financial control</h1>
        <p className="mt-2 text-sm text-ink-soft sm:text-base">Choose a plan that fits the way you manage your money.</p>
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
        <PricingCard plan={free} billingCycle={billingCycle} isCurrent={Boolean(user) && !isPro} onSelect={() => {}} />
        <PricingCard
          plan={pro}
          billingCycle={billingCycle}
          isCurrent={Boolean(user) && isPro}
          loading={checkout.isPending}
          onSelect={onSelectPro}
        />
      </div>

      <p className="mx-auto mt-6 flex max-w-3xl items-center justify-center gap-1.5 text-center text-xs text-ink-soft">
        <ShieldCheck className="h-3.5 w-3.5 text-success" /> Secure payments powered by Razorpay
      </p>

      <div className="mx-auto mt-8 max-w-md">
        {user ? (
          <CustomOfferCard offer={customOffer} />
        ) : (
          <div className="card p-6 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400">
              <Sparkles className="h-5 w-5" />
            </span>
            <h3 className="mt-3 text-base font-bold">Need something different?</h3>
            <p className="mt-1 text-sm text-ink-soft">Create a free account to request a custom plan tailored to you.</p>
            <Link to="/register" className="btn-primary mt-4">
              Get Started
            </Link>
          </div>
        )}
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

      <div className="mx-auto mt-14 max-w-2xl">
        <h2 className="mb-4 text-center text-lg font-bold">Frequently asked questions</h2>
        <div className="card divide-y divide-line p-0 dark:divide-white/5">
          {FAQ.map((f) => (
            <div key={f.q} className="p-5">
              <p className="text-sm font-semibold">{f.q}</p>
              <p className="mt-1.5 text-sm text-ink-soft">{f.a}</p>
            </div>
          ))}
        </div>
      </div>

      {user && currentPlan && (
        <p className="mt-8 text-center text-xs text-ink-soft">
          You&apos;re currently on the <b>{currentPlan.name}</b> plan.
        </p>
      )}
    </PageContainer>
  )
}
