import { Link } from 'react-router-dom'
import LegalPageLayout from './components/LegalPageLayout'
import { BUSINESS_INFO, isConfigured } from '../../config/businessConfig'

const brand = BUSINESS_INFO.brandName

export default function RefundPolicyPage() {
  const sections = [
    {
      id: 'overview',
      heading: '1. Overview',
      content: [
        <>
          This policy explains how subscription cancellation, billing, and refunds work for {brand}&apos;s paid plans
          (Pro and Custom). It applies alongside our{' '}
          <Link to="/terms" className="font-medium text-brand-700 underline dark:text-brand-400">
            Terms &amp; Conditions
          </Link>
          .
        </>,
      ],
    },
    {
      id: 'subscription-cancellation',
      heading: '2. Subscription Cancellation',
      content: [
        'Cancelling your subscription and receiving a refund are two separate things. Cancellation stops your subscription from renewing in the future — it does not, by itself, mean any amount already paid will be refunded.',
      ],
    },
    {
      id: 'cancellation-by-user',
      heading: '3. Cancellation by the User',
      content: [
        'You can cancel your subscription at any time from Settings → Subscription. Once cancelled, your Pro or Custom plan access continues until the end of the billing period you have already paid for; no further charge will be made after that. You can resume an active subscription before that period ends if you change your mind.',
      ],
    },
    {
      id: 'cancellation-by-moneyflow',
      heading: '4. Cancellation by MoneyFlow',
      content: [
        `${brand} may cancel or suspend a subscription in cases such as non-payment, suspected misuse of the Service, or violation of our Terms & Conditions. Where reasonably possible, we will attempt to notify you before doing so.`,
      ],
    },
    {
      id: 'billing',
      heading: '5. Billing',
      content: [
        'Paid plans are billed in advance on a recurring monthly or yearly basis, depending on the billing cycle you choose, through Razorpay.',
      ],
    },
    {
      id: 'failed-payments',
      heading: '6. Failed Payments',
      content: [
        'If a renewal payment fails, your subscription is marked as past due. We (or Razorpay, on our behalf) may retry the payment. If payment cannot be collected, your plan may be downgraded or suspended until payment succeeds or you cancel.',
      ],
    },
    {
      id: 'renewal',
      heading: '7. Renewal',
      content: [
        'Unless cancelled before the renewal date, your subscription renews automatically at the price and billing cycle in effect for your plan at the time of renewal.',
      ],
    },
    {
      id: 'refund-requests',
      heading: '8. Refund Requests',
      content: [
        `${brand} does not currently offer an automatic or guaranteed refund (for example, we do not promise a fixed refund window such as "7 days money back"). If you believe you were charged in error, or have an exceptional circumstance, you may contact us to request a refund and we will review it on a case-by-case basis.`,
      ],
    },
    {
      id: 'eligibility',
      heading: '9. Eligibility for Refunds',
      content: [
        'Refund requests are considered at our discretion, taking into account factors such as duplicate or erroneous charges, unauthorised transactions, and the extent to which the paid period has already been used. Submitting a request does not guarantee a refund will be issued.',
      ],
    },
    {
      id: 'custom-plan-refunds',
      heading: '10. Custom Plan Refunds',
      content: [
        'Custom plans are individually priced and agreed between you and MoneyFlow before payment. Because the price and terms are specifically negotiated for you, refund requests for a Custom plan are also reviewed case-by-case, taking into account the agreed terms of that specific offer.',
      ],
    },
    {
      id: 'processing',
      heading: '11. Processing of Approved Refunds',
      content: [
        'If a refund is approved, it will be issued back to the original payment method through Razorpay. Processing time depends on Razorpay and your bank or card issuer, and is outside our direct control.',
      ],
    },
    {
      id: 'contact',
      heading: '12. Contact Us',
      content: [
        isConfigured(BUSINESS_INFO.supportEmail)
          ? `To cancel a subscription, ask about billing, or request a refund, contact us at ${BUSINESS_INFO.supportEmail} or via our Contact page.`
          : 'To cancel a subscription, ask about billing, or request a refund, contact us via our Contact page.',
      ],
    },
  ]

  return (
    <LegalPageLayout
      title="Cancellation & Refund Policy"
      description="Information about subscription cancellation, billing and refunds."
      sections={sections}
    />
  )
}
