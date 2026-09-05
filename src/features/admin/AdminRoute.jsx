import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useAdminAccess } from './hooks/useAdmin'
import Logo from '../../components/common/Logo'
import AdminAccessDeniedPage from './pages/AdminAccessDeniedPage'

/**
 * Gate for every /admin/* route. Never renders admin content before the
 * role check resolves (no flash of privileged UI), and never silently
 * redirects a denied user away — they see an explicit Access Restricted
 * page, same URL, so the boundary is legible rather than mysterious.
 *
 * This is UX only. The real boundary is require_admin()/require_super_admin()
 * inside every admin_* RPC — a denied user who somehow rendered this page
 * still could not read or change anything.
 */
export default function AdminRoute({ children }) {
  const { session, loading: authLoading } = useAuth()
  const location = useLocation()
  const { resolved, isAdmin, isLoading, isError } = useAdminAccess()

  if (authLoading) return null
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  if (isLoading || !resolved) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Logo className="h-10 w-10 animate-pulse" />
        <p className="text-sm text-ink-soft">Verifying admin access…</p>
      </div>
    )
  }

  // A transient fetch error must never be treated as "denied" — show a retry
  // state, not Access Restricted, and definitely not the admin console.
  if (isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-ink-soft">Unable to verify admin access right now. Please try again.</p>
        <button className="btn-primary" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    )
  }

  if (!isAdmin) return <AdminAccessDeniedPage />

  return children
}
