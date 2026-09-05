import { useQuery } from '@tanstack/react-query'
import { getAdminPayments } from '../services/adminService'

export function useAdminPayments(filters) {
  return useQuery({
    queryKey: ['admin', 'payments', filters],
    queryFn: () => getAdminPayments(filters),
    placeholderData: (prev) => prev,
  })
}
