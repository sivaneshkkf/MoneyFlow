import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminAdmins, grantAdminRole, revokeAdminRole } from '../services/adminService'

export function useAdminAdmins() {
  return useQuery({
    queryKey: ['admin', 'admins'],
    queryFn: getAdminAdmins,
  })
}

export function useAdminRoleMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admin', 'admins'] })
  const grant = useMutation({ mutationFn: grantAdminRole, onSuccess: invalidate })
  const revoke = useMutation({ mutationFn: revokeAdminRole, onSuccess: invalidate })
  return { grant, revoke }
}
