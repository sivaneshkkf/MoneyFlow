import { useQuery } from '@tanstack/react-query'
import { getAdminAuditLogs } from '../services/adminService'

export function useAdminAuditLogs(filters) {
  return useQuery({
    queryKey: ['admin', 'audit-logs', filters],
    queryFn: () => getAdminAuditLogs(filters),
    placeholderData: (prev) => prev,
  })
}
