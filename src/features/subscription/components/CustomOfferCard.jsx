import { useState } from 'react'
import { Check, Sparkles, MessageCircle, Clock } from 'lucide-react'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatCurrency, formatDate } from '../../../utils/format'
import { useCustomPlanMutations } from '../hooks/useCustomPlan'
import { buildWhatsAppLink, isOfferExpired } from '../customPlanMeta'
import RequestCustomPlanModal from './RequestCustomPlanModal'

const cycleLabel = (c) => (c === 'yearly' ? 'year' : 'month')

const CUSTOM_FEATURES = [
  'Flexible pricing',
  'Full access to all features',
  'Custom limits (accounts, transactions, etc.)',
  'Priority support',
  'Personalized setup assistance',
  'Ideal for power users, families & businesses',
]

/** Shared card shell — matches PricingCard's Free/Pro columns so all three sit
 * flush in one row. */
function Shell({ children }) {
  return (
    <div className="relative flex h-full flex-col rounded-2xl border border-line bg-white p-6 transition dark:border-white/10 dark:bg-[#161F1D]">
      {children}
    </div>
  )
}

function Header({ eyebrow }) {
  return (
    <>
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/15 text-violet-600 dark:bg-violet-400/15 dark:text-violet-400">
        <Sparkles className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-bold uppercase tracking-wide">Custom</p>
      <p className="mt-1 text-sm text-ink-soft">{eyebrow}</p>
    </>
  )
}

/**
 * Everything the Custom plan can look like to the signed-in user — a single
 * embeddable card for Pricing / Subscription. State comes entirely from the
 * customer's own custom_plan_requests row (RLS-scoped); there is no local
 * "did I request" flag to fall out of sync with the database.
 */
export default function CustomOfferCard({ offer }) {
  const { decline, acceptAndPay, resumePayment } = useCustomPlanMutations()
  const toast = useToast()
  const [requestOpen, setRequestOpen] = useState(false)
  const [confirmDecline, setConfirmDecline] = useState(false)

  const expired = offer?.status === 'offered' && isOfferExpired(offer)
  const whatsappLink = offer ? buildWhatsAppLink(offer) : null

  const onAccept = async () => {
    try {
      await acceptAndPay.mutateAsync(offer.id)
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to start checkout right now.'))
    }
  }
  const onResumePayment = async () => {
    try {
      await resumePayment.mutateAsync(offer.id)
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to start checkout right now.'))
    }
  }
  const onDecline = async () => {
    try {
      await decline.mutateAsync(offer.id)
      toast.success('Offer declined.')
      setConfirmDecline(false)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  // No offer yet, or a past one that's fully settled without anything to show.
  if (!offer || ['declined', 'rejected', 'cancelled'].includes(offer.status)) {
    return (
      <Shell>
        <Header eyebrow="Tailored for you." />

        <p className="mt-4 text-3xl font-extrabold tracking-tight">Custom</p>
        <p className="mt-0.5 text-xs text-ink-soft">Flexible pricing based on your needs.</p>

        <div className="my-5 border-t border-line dark:border-white/10" />

        <ul className="flex-1 space-y-2.5">
          {CUSTOM_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2.5} />
              {f}
            </li>
          ))}
        </ul>

        <button className="btn-ghost mt-6 w-full justify-center border border-line dark:border-white/10" onClick={() => setRequestOpen(true)}>
          Get started
        </button>
        <RequestCustomPlanModal open={requestOpen} onClose={() => setRequestOpen(false)} />
      </Shell>
    )
  }

  if (offer.status === 'pending' || offer.status === 'reviewing') {
    return (
      <Shell>
        <Header eyebrow="Tailored for you." />
        <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-info/10 text-info">
            <Clock className="h-5 w-5" />
          </span>
          <h3 className="mt-3 text-base font-bold">Your request is being reviewed</h3>
          <p className="mt-1 text-sm text-ink-soft">
            We&apos;ll notify you as soon as MoneyFlow has an offer ready
            {offer.requested_price != null && ` — you asked for ${formatCurrency(offer.requested_price)}/${cycleLabel(offer.billing_cycle)}`}.
          </p>
        </div>
      </Shell>
    )
  }

  if (offer.status === 'expired' || expired) {
    return (
      <Shell>
        <Header eyebrow="Tailored for you." />
        <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
          <h3 className="text-base font-bold">Offer expired</h3>
          <p className="mt-1 text-sm text-ink-soft">This custom offer is no longer valid.</p>
        </div>
        <button className="btn-primary mt-6 w-full justify-center" onClick={() => setRequestOpen(true)}>
          Request a Quote
        </button>
        <RequestCustomPlanModal open={requestOpen} onClose={() => setRequestOpen(false)} />
      </Shell>
    )
  }

  if (offer.status === 'payment_pending') {
    return (
      <Shell>
        <Header eyebrow="Tailored for you." />
        <div className="mt-4 flex flex-1 flex-col items-center justify-center text-center">
          <h3 className="text-base font-bold">Payment in progress</h3>
          <p className="mt-1 text-sm text-ink-soft">Finish your payment to activate your custom plan.</p>
        </div>
        <button className="btn-primary mt-6 w-full justify-center" onClick={onResumePayment} disabled={resumePayment.isPending}>
          {resumePayment.isPending ? 'Opening checkout…' : 'Continue to payment'}
        </button>
      </Shell>
    )
  }

  if (offer.status === 'active') {
    return (
      <Shell>
        <Header eyebrow="Tailored for you." />

        <div className="mt-4 flex items-baseline gap-1">
          <span className="text-3xl font-extrabold tracking-tight">{formatCurrency(offer.admin_price)}</span>
          <span className="text-sm text-ink-soft">/{cycleLabel(offer.billing_cycle)}</span>
        </div>
        <p className="mt-0.5 text-xs text-ink-soft">Flexible pricing based on your needs.</p>

        <div className="my-5 border-t border-line dark:border-white/10" />

        <ul className="flex-1 space-y-2.5">
          {CUSTOM_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2.5} />
              {f}
            </li>
          ))}
        </ul>

        <button className="btn-ghost mt-6 w-full justify-center border border-violet-500/30 text-violet-700 dark:text-violet-400" disabled>
          Current plan
        </button>
      </Shell>
    )
  }

  // status === 'offered' and not expired.
  const requestedDifferent =
    offer.offer_source === 'user_request' && offer.requested_price != null && Number(offer.requested_price) !== Number(offer.admin_price)
  const priceAccepted =
    offer.offer_source === 'user_request' && offer.requested_price != null && Number(offer.requested_price) === Number(offer.admin_price)

  return (
    <Shell>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.14), transparent 70%)' }}
      />
      <Header eyebrow={priceAccepted ? 'Your Custom Plan' : 'Special offer for you.'} />

      {requestedDifferent ? (
        <div className="relative mt-4 flex items-center gap-4">
          <div>
            <p className="text-xs text-ink-soft">Your requested price</p>
            <p className="text-sm font-semibold line-through opacity-60">
              {formatCurrency(offer.requested_price)}/{cycleLabel(offer.billing_cycle)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">MoneyFlow offer</p>
            <p className="text-xl font-extrabold">
              {formatCurrency(offer.admin_price)}
              <span className="text-sm font-normal text-ink-soft">/{cycleLabel(offer.billing_cycle)}</span>
            </p>
          </div>
        </div>
      ) : (
        <div className="relative mt-4 flex items-baseline gap-1">
          <span className="text-3xl font-extrabold tracking-tight">{formatCurrency(offer.admin_price)}</span>
          <span className="text-sm text-ink-soft">/{cycleLabel(offer.billing_cycle)}</span>
        </div>
      )}
      <p className="relative mt-0.5 text-xs text-ink-soft">
        {priceAccepted ? 'Your requested price has been accepted.' : 'Flexible pricing based on your needs.'}
      </p>

      {offer.description && offer.offer_source === 'admin_direct' && (
        <p className="relative mt-3 rounded-lg bg-brand-50 p-2.5 text-sm dark:bg-white/5">&ldquo;{offer.description}&rdquo;</p>
      )}
      {offer.admin_message && (
        <p className="relative mt-2 text-sm italic text-ink-soft">&ldquo;{offer.admin_message}&rdquo;</p>
      )}
      {offer.valid_until && <p className="relative mt-2 text-xs text-ink-soft">Valid until {formatDate(offer.valid_until)}</p>}

      <div className="my-5 border-t border-line dark:border-white/10" />

      <ul className="relative flex-1 space-y-2.5">
        {CUSTOM_FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" strokeWidth={2.5} />
            {f}
          </li>
        ))}
      </ul>

      <div className="relative mt-6 space-y-2">
        <button className="btn-primary w-full justify-center" onClick={onAccept} disabled={acceptAndPay.isPending}>
          {acceptAndPay.isPending ? 'Starting checkout…' : 'Accept & Pay →'}
        </button>
        {whatsappLink && (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost w-full justify-center border border-line dark:border-white/10"
          >
            <MessageCircle className="h-4 w-4" /> Discuss on WhatsApp
          </a>
        )}
        <button className="btn-ghost w-full justify-center text-danger" onClick={() => setConfirmDecline(true)}>
          Decline
        </button>
      </div>

      <ConfirmDialog
        open={confirmDecline}
        onClose={() => setConfirmDecline(false)}
        onConfirm={onDecline}
        title="Decline this offer?"
        message="You can request a new quote any time."
        confirmLabel="Decline offer"
        loading={decline.isPending}
      />
    </Shell>
  )
}
