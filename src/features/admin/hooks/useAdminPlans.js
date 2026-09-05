import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminPlans, updateAdminPlan } from '../services/adminService'

export function useAdminPlans() {
  return useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: getAdminPlans,
  })
}

export function useAdminPlanMutations() {
  const qc = useQueryClient()
  const update = useMutation({
    mutationFn: updateAdminPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'plans'] })
      // Plan changes are user-visible immediately on Pricing / Upgrade / Settings.
      qc.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
  return { update }
}
