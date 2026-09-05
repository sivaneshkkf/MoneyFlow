import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cancelMySubscription, resumeMySubscription, createCheckout } from '../services/subscriptionService'

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

  const checkout = useMutation({
    mutationFn: createCheckout,
  })

  return { cancel, resume, checkout }
}
