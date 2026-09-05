import { useState } from 'react'
import { Sparkles, MessageCircle, Clock } from 'lucide-react'
import ConfirmDialog from '../../../components/common/ConfirmDialog'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatCurrency, formatDate } from '../../../utils/format'
import { useCustomPlanMutations } from '../hooks/useCustomPlan'
import { buildWhatsAppLink, isOfferExpired } from '../customPlanMeta'
import RequestCustomPlanModal from './RequestCustomPlanModal'

const cycleLabel = (c) => (c === 'yearly' ? 'year' : 'month')

/**
 * Everything the Custom plan can look like to the signed-in user — a single
 * embeddable card for Pricing / Subscription. State comes entirely from the
 * customer's own custom_plan_requests row (RLS-scoped); there is no local
 * "did I request" flag to fall out of sync with the database.
 */
export default function CustomOfferCard({ offer }) {
  const { decline, acceptAndPay } = useCustomPlanMutations()
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
      <div className="card p-6 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400">
          <Sparkles className="h-5 w-5" />
        </span>
        <h3 className="mt-3 text-base font-bold">Need something different?</h3>
        <p className="mt-1 text-sm text-ink-soft">Tell us what you need and we&apos;ll put together a plan just for you.</p>
        <button className="btn-primary mt-4" onClick={() => setRequestOpen(true)}>
          Request a Quote
        </button>
        <RequestCustomPlanModal open={requestOpen} onClose={() => setRequestOpen(false)} />
      </div>
    )
  }

  if (offer.status === 'pending' || offer.status === 'reviewing') {
    return (
      <div className="card p-6 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-info/10 text-info">
          <Clock className="h-5 w-5" />
        </span>
        <h3 className="mt-3 text-base font-bold">Your request is being reviewed</h3>
        <p className="mt-1 text-sm text-ink-soft">
          We&apos;ll notify you as soon as MoneyFlow has an offer ready
          {offer.requested_price != null && ` — you asked for ${formatCurrency(offer.requested_price)}/${cycleLabel(offer.billing_cycle)}`}.
        </p>
      </div>
    )
  }

  if (offer.status === 'expired' || expired) {
    return (
      <div className="card p-6 text-center">
        <h3 className="text-base font-bold">Offer Expired</h3>
        <p className="mt-1 text-sm text-ink-soft">This custom offer is no longer valid.</p>
        <button className="btn-primary mt-4" onClick={() => setRequestOpen(true)}>
          Request a Quote
        </button>
        <RequestCustomPlanModal open={requestOpen} onClose={() => setRequestOpen(false)} />
      </div>
    )
  }

  if (offer.status === 'payment_pending') {
    return (
      <div className="card p-6 text-center">
        <h3 className="text-base font-bold">Payment in progress</h3>
        <p className="mt-1 text-sm text-ink-soft">Finish your payment to activate your custom plan.</p>
        <button className="btn-primary mt-4" onClick={onAccept} disabled={acceptAndPay.isPending}>
          {acceptAndPay.isPending ? 'Opening checkout…' : 'Continue to payment'}
        </button>
      </div>
    )
  }

  if (offer.status === 'active') {
    return (
      <div className="card p-6 text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-dark to-brand-700 text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <h3 className="mt-3 text-base font-bold">You&apos;re on your Custom Plan ✦</h3>
        <p className="mt-1 text-sm text-ink-soft">
          {formatCurrency(offer.admin_price)}/{cycleLabel(offer.billing_cycle)} — enjoy full access.
        </p>
      </div>
    )
  }

  // status === 'offered' and not expired.
  const requestedDifferent =
    offer.offer_source === 'user_request' && offer.requested_price != null && Number(offer.requested_price) !== Number(offer.admin_price)
  const priceAccepted =
    offer.offer_source === 'user_request' && offer.requested_price != null && Number(offer.requested_price) === Number(offer.admin_price)

  return (
    <div className="card relative overflow-hidden p-6">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(34,197,94,0.14), transparent 70%)' }}
      />
      <p className="relative inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">
        <Sparkles className="h-3.5 w-3.5" /> {priceAccepted ? 'Your Custom Plan' : 'Special Offer'}
      </p>
      <h3 className="relative mt-1 text-lg font-bold">Custom MoneyFlow Plan</h3>

      {requestedDifferent ? (
        <div className="relative mt-3 flex items-center gap-4">
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
        <p className="relative mt-2 text-2xl font-extrabold">
          {formatCurrency(offer.admin_price)}
          <span className="text-sm font-normal text-ink-soft">/{cycleLabel(offer.billing_cycle)}</span>
        </p>
      )}

      <p className="relative mt-2 text-sm text-ink-soft">
        {priceAccepted
          ? 'Your requested price has been accepted.'
          : offer.offer_source === 'admin_direct'
            ? 'Special offer created for you by MoneyFlow.'
            : 'Special offer from MoneyFlow.'}
      </p>

      {offer.description && offer.offer_source === 'admin_direct' && (
        <p className="relative mt-2 rounded-lg bg-brand-50 p-2.5 text-sm dark:bg-white/5">&ldquo;{offer.description}&rdquo;</p>
      )}
      {offer.admin_message && (
        <p className="relative mt-2 text-sm italic text-ink-soft">&ldquo;{offer.admin_message}&rdquo;</p>
      )}
      {offer.valid_until && (
        <p className="relative mt-2 text-xs text-ink-soft">Valid until {formatDate(offer.valid_until)}</p>
      )}

      <div className="relative mt-5 space-y-2">
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
    </div>
  )
}
