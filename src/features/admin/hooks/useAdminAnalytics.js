import { useQuery } from '@tanstack/react-query'
import { getAdminDashboardStats, getAdminUserGrowth, getAdminSubscriptionGrowth } from '../services/adminService'

export function useAdminDashboard() {
  return useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: getAdminDashboardStats,
    staleTime: 60_000,
  })
}

export function useAdminGrowth(days = 30) {
  const userGrowth = useQuery({
    queryKey: ['admin', 'growth', 'users', days],
    queryFn: () => getAdminUserGrowth(days),
    staleTime: 60_000,
  })
  const subGrowth = useQuery({
    queryKey: ['admin', 'growth', 'subscriptions', days],
    queryFn: () => getAdminSubscriptionGrowth(days),
    staleTime: 60_000,
  })
  return {
    userGrowth: userGrowth.data ?? [],
    subscriptionGrowth: subGrowth.data ?? [],
    isLoading: userGrowth.isLoading || subGrowth.isLoading,
    isError: userGrowth.isError || subGrowth.isError,
  }
}
