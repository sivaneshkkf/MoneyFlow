import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import {
  requestCustomPlan, fetchMyCustomPlanOffer, declineCustomPlanOffer,
  acceptCustomPlanOffer, createCustomPlanCheckout,
} from '../services/customPlanService'
import { openRazorpayCheckout } from '../razorpayCheckout'

export function useMyCustomPlanOffer() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['subscription', 'custom-plan', 'mine', user?.id],
    enabled: Boolean(user?.id),
    queryFn: fetchMyCustomPlanOffer,
    staleTime: 30_000,
  })
}

export function useCustomPlanMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['subscription'] })
  }

  const request = useMutation({ mutationFn: requestCustomPlan, onSuccess: invalidate })
  const decline = useMutation({ mutationFn: declineCustomPlanOffer, onSuccess: invalidate })

  // Accept -> create the real Razorpay subscription -> open Checkout.
  // Activation is never assumed here; it only ever happens via the webhook.
  const acceptAndPay = useMutation({
    mutationFn: async (offerId) => {
      const accepted = await acceptCustomPlanOffer(offerId)
      const checkout = await createCustomPlanCheckout(accepted.id)
      await openRazorpayCheckout(
        { keyId: checkout.key_id, subscriptionId: checkout.subscription_id },
        { onDismiss: invalidate },
      )
      return accepted
    },
    onSuccess: invalidate,
  })

  return { request, decline, acceptAndPay }
}
