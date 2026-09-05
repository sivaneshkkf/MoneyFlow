// Custom Plan / Request-a-Quote — presentation constants + pure helpers only.
// The database (custom_plan_requests) is the single source of truth for
// status/price; nothing here decides money.
import { BUSINESS_INFO } from '../../config/businessConfig'

// The WhatsApp button only renders once BUSINESS_INFO.whatsappNumber is set
// (see businessConfig.js) — a placeholder number is never dialled for real.
export const WHATSAPP_BUSINESS_NUMBER = BUSINESS_INFO.whatsappNumber

export const CUSTOM_PLAN_STATUS_META = {
  pending: { label: 'Pending review', tone: 'neutral' },
  reviewing: { label: 'Reviewing', tone: 'info' },
  offered: { label: 'Offered', tone: 'success' },
  payment_pending: { label: 'Payment pending', tone: 'warning' },
  active: { label: 'Active', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'danger' },
}

export const OFFER_SOURCE_META = {
  user_request: { label: 'User Request', tone: 'info' },
  admin_direct: { label: 'Admin Offer', tone: 'success' },
}

export const CUSTOM_PLAN_FILTERS = [
  { key: '', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'offered', label: 'Offered' },
  { key: 'payment_pending', label: 'Payment Pending' },
  { key: 'active', label: 'Active' },
  { key: 'declined', label: 'Declined' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'expired', label: 'Expired' },
]

/** Short human reference for an offer, e.g. "MF-8F42A1". Display-only, not stored. */
export function offerReference(id) {
  return `MF-${String(id ?? '').replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

export function isOfferExpired(offer) {
  return Boolean(offer?.valid_until) && new Date(offer.valid_until).getTime() < Date.now()
}

/**
 * Pre-filled WhatsApp deep link — pure client-side, never stores the
 * conversation, never changes price. `offer_source` decides whether "my
 * requested price" appears at all (an admin_direct offer was never requested).
 */
export function buildWhatsAppLink(offer) {
  if (!WHATSAPP_BUSINESS_NUMBER) return null
  const lines = ['Hi MoneyFlow team,', '', 'I would like to discuss my custom plan offer.', '']
  lines.push(`Offer reference: ${offerReference(offer.id)}`)
  lines.push(`Billing: ${offer.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly'}`)
  if (offer.offer_source === 'user_request' && offer.requested_price != null) {
    lines.push(`My requested price: ₹${offer.requested_price}/${offer.billing_cycle === 'yearly' ? 'year' : 'month'}`)
  }
  if (offer.admin_price != null) {
    lines.push(`Current offer: ₹${offer.admin_price}/${offer.billing_cycle === 'yearly' ? 'year' : 'month'}`)
  }
  lines.push('', 'Thank you.')
  return `https://wa.me/${WHATSAPP_BUSINESS_NUMBER}?text=${encodeURIComponent(lines.join('\n'))}`
}
