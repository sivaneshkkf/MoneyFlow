import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import Logo from '../../components/common/Logo'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <Logo className="h-10 w-10 animate-pulse" />
        <p className="text-sm text-ink-soft">Loading your workspace…</p>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
