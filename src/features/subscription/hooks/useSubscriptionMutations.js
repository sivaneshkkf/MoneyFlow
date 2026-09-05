import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cancelMySubscription, resumeMySubscription, createCheckout } from '../services/subscriptionService'
import { openRazorpayCheckout } from '../razorpayCheckout'

export function useSubscriptionMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['subscription'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const cancel = useMutation({
    mutationFn: cancelMySubscription,
    onSuccess: invalidate,
  })

  const resume = useMutation({
    mutationFn: resumeMySubscription,
    onSuccess: invalidate,
  })

  // Creates the real Razorpay subscription, then opens Checkout. Activation
  // is never assumed here — it only ever happens via the webhook once
  // Razorpay confirms payment (see subscription-webhook).
  const checkout = useMutation({
    mutationFn: async ({ planSlug, billingCycle }) => {
      const res = await createCheckout({ planSlug, billingCycle })
      if (res.status === 'checkout') {
        await openRazorpayCheckout(
          { keyId: res.key_id, subscriptionId: res.subscription_id, description: 'MoneyFlow Pro' },
          { onDismiss: invalidate },
        )
      }
      return res
    },
  })

  return { cancel, resume, checkout }
}
