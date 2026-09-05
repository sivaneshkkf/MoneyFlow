import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAdminCustomPlanRequests, getAdminCustomPlanRequestDetail, respondToCustomPlanRequest,
  rejectCustomPlanRequest, createCustomOffer, updateCustomOffer, cancelCustomOffer,
} from '../../subscription/services/customPlanService'

export function useAdminCustomPlanRequests(filters) {
  return useQuery({
    queryKey: ['admin', 'custom-plans', filters],
    queryFn: () => getAdminCustomPlanRequests(filters),
    placeholderData: (prev) => prev,
  })
}

export function useAdminCustomPlanRequestDetail(id) {
  return useQuery({
    queryKey: ['admin', 'custom-plan', id],
    enabled: Boolean(id),
    queryFn: () => getAdminCustomPlanRequestDetail(id),
  })
}

export function useAdminCustomPlanMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'custom-plans'] })
    qc.invalidateQueries({ queryKey: ['admin', 'custom-plan'] })
    qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
  }

  const respond = useMutation({ mutationFn: respondToCustomPlanRequest, onSuccess: invalidate })
  const reject = useMutation({ mutationFn: rejectCustomPlanRequest, onSuccess: invalidate })
  const createOffer = useMutation({ mutationFn: createCustomOffer, onSuccess: invalidate })
  const updateOffer = useMutation({ mutationFn: updateCustomOffer, onSuccess: invalidate })
  const cancelOffer = useMutation({ mutationFn: cancelCustomOffer, onSuccess: invalidate })

  return { respond, reject, createOffer, updateOffer, cancelOffer }
}
