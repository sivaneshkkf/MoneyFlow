import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAdminUsers, getAdminUserDetails, getAdminUserUsage, viewFinancialData,
  suspendUser, reactivateUser, changeUserPlan, cancelUserSubscription, resumeUserSubscription,
} from '../services/adminService'

export function useAdminUsers(filters) {
  return useQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: () => getAdminUsers(filters),
    placeholderData: (prev) => prev,
  })
}

export function useAdminUserDetails(userId) {
  const details = useQuery({
    queryKey: ['admin', 'user', userId],
    enabled: Boolean(userId),
    queryFn: () => getAdminUserDetails(userId),
  })
  const usage = useQuery({
    queryKey: ['admin', 'user-usage', userId],
    enabled: Boolean(userId),
    queryFn: () => getAdminUserUsage(userId),
  })
  return {
    user: details.data,
    usage: usage.data ?? [],
    isLoading: details.isLoading || usage.isLoading,
    isError: details.isError || usage.isError,
    refetch: () => {
      details.refetch()
      usage.refetch()
    },
  }
}

export function useAdminUserMutations(userId) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    qc.invalidateQueries({ queryKey: ['admin', 'user', userId] })
    qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] })
    qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
  }

  const suspend = useMutation({ mutationFn: suspendUser, onSuccess: invalidate })
  const reactivate = useMutation({ mutationFn: reactivateUser, onSuccess: invalidate })
  const changePlan = useMutation({ mutationFn: changeUserPlan, onSuccess: invalidate })
  const cancelSubscription = useMutation({ mutationFn: cancelUserSubscription, onSuccess: invalidate })
  const resumeSubscription = useMutation({ mutationFn: resumeUserSubscription, onSuccess: invalidate })
  const loadFinancialData = useMutation({ mutationFn: viewFinancialData })

  return { suspend, reactivate, changePlan, cancelSubscription, resumeSubscription, loadFinancialData }
}
