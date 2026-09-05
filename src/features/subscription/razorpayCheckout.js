// Lazy-loads Razorpay's Checkout widget only when a payment is actually
// being started (not on every page load) — no other third-party script is
// added anywhere else in the app.
let loadingPromise = null

function loadRazorpayScript() {
  if (typeof window !== 'undefined' && window.Razorpay) return Promise.resolve()
  if (loadingPromise) return loadingPromise
  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Unable to load the payment widget. Check your connection and try again.'))
    document.body.appendChild(script)
  })
  return loadingPromise
}

/**
 * Opens Razorpay's hosted Checkout for a subscription already created
 * server-side (create-custom-plan-checkout). Activation itself never
 * happens here — only the subscription-webhook Edge Function, once Razorpay
 * confirms payment, is allowed to mark anything active.
 */
export async function openRazorpayCheckout({ keyId, subscriptionId, description }, { onDismiss } = {}) {
  await loadRazorpayScript()
  const rzp = new window.Razorpay({
    key: keyId,
    subscription_id: subscriptionId,
    name: 'MoneyFlow',
    description: description ?? 'MoneyFlow Custom Plan',
    theme: { color: '#2F6F63' },
    // No `handler` here on purpose: a successful callback in the browser is
    // not proof of payment — only the webhook is. The modal simply closes;
    // the offer card refetches and shows whatever the webhook has since set.
    modal: { ondismiss: () => onDismiss?.() },
  })
  rzp.open()
}
