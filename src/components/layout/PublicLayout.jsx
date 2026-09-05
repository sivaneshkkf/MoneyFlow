import { Outlet } from 'react-router-dom'
import PublicHeader from './PublicHeader'
import PublicFooter from './PublicFooter'

/**
 * Shell for every page that must be reachable without signing in
 * (Pricing, Terms, Privacy, Refund Policy, Contact — required for Razorpay's
 * website review). Deliberately separate from AppLayout: no sidebar, no
 * auth requirement, but the same design tokens/components throughout.
 */
export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-bg dark:bg-[#0F1614]">
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  )
}
