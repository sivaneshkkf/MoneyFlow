import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { checkAdminAccess } from '../services/adminService'

/**
 * The one place that decides whether the current user may see /admin at
 * all. Server-enforced regardless (every RPC re-checks), but this is what
 * AdminRoute and the sidebar/settings use to decide what to render.
 */
export function useAdminAccess() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['admin', 'access', user?.id],
    enabled: Boolean(user?.id),
    queryFn: checkAdminAccess,
    staleTime: 60_000,
    retry: false,
  })
  return {
    ...query,
    isAdmin: Boolean(query.data?.isAdmin),
    isSuperAdmin: Boolean(query.data?.isSuperAdmin),
    // Only "resolved" once we actually have an answer — never treat a
    // loading/error state as "not admin" (that would flash Access Denied).
    resolved: query.isSuccess,
  }
}
