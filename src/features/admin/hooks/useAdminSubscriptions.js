import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminSubscriptions, changeUserPlan, cancelUserSubscription, resumeUserSubscription } from '../services/adminService'

export function useAdminSubscriptions(filters) {
  return useQuery({
    queryKey: ['admin', 'subscriptions', filters],
    queryFn: () => getAdminSubscriptions(filters),
    placeholderData: (prev) => prev,
  })
}

export function useAdminSubscriptionMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
    qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    qc.invalidateQueries({ queryKey: ['admin', 'user'] })
    qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
  }

  const changePlan = useMutation({ mutationFn: changeUserPlan, onSuccess: invalidate })
  const cancel = useMutation({ mutationFn: cancelUserSubscription, onSuccess: invalidate })
  const resume = useMutation({ mutationFn: resumeUserSubscription, onSuccess: invalidate })

  return { changePlan, cancel, resume }
}
