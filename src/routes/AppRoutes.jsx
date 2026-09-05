import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout'
import ProtectedRoute from '../features/auth/ProtectedRoute'
import AdminRoute from '../features/admin/AdminRoute'
import { useAuth } from '../features/auth/AuthProvider'

const LoginPage = lazy(() => import('../features/auth/LoginPage'))
const RegisterPage = lazy(() => import('../features/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'))
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'))
const TransactionsPage = lazy(() => import('../features/transactions/TransactionsPage'))
const IncomePage = lazy(() => import('../features/income/IncomePage'))
const ExpensesPage = lazy(() => import('../features/expenses/ExpensesPage'))
const AccountsPage = lazy(() => import('../features/accounts/AccountsPage'))
const BudgetsPage = lazy(() => import('../features/budgets/BudgetsPage'))
const BillsPage = lazy(() => import('../features/bills/BillsPage'))
const BillDetailPage = lazy(() => import('../features/bills/BillDetailPage'))
const GoalsPage = lazy(() => import('../features/goals/GoalsPage'))
const LendingGivenPage = lazy(() => import('../features/lending/LendingGivenPage'))
const LendingReceivedPage = lazy(() => import('../features/lending/LendingReceivedPage'))
const LendingDetailPage = lazy(() => import('../features/lending/LendingDetailPage'))
const AnalyticsPage = lazy(() => import('../features/analytics/AnalyticsPage'))
const ReportsPage = lazy(() => import('../features/reports/ReportsPage'))
const PricingPage = lazy(() => import('../features/subscription/pages/PricingPage'))
const SubscriptionPage = lazy(() => import('../features/subscription/pages/SubscriptionPage'))
const AdminLayout = lazy(() => import('../features/admin/components/AdminLayout'))
const AdminDashboardPage = lazy(() => import('../features/admin/pages/AdminDashboardPage'))
const AdminUsersPage = lazy(() => import('../features/admin/pages/AdminUsersPage'))
const AdminUserDetailsPage = lazy(() => import('../features/admin/pages/AdminUserDetailsPage'))
const AdminSubscriptionsPage = lazy(() => import('../features/admin/pages/AdminSubscriptionsPage'))
const AdminCustomPlansPage = lazy(() => import('../features/admin/pages/AdminCustomPlansPage'))
const AdminPlansPage = lazy(() => import('../features/admin/pages/AdminPlansPage'))
const AdminPaymentsPage = lazy(() => import('../features/admin/pages/AdminPaymentsPage'))
const AdminAuditLogsPage = lazy(() => import('../features/admin/pages/AdminAuditLogsPage'))
const AdminSettingsPage = lazy(() => import('../features/admin/pages/AdminSettingsPage'))
const SettingsLayout = lazy(() => import('../features/settings/SettingsLayout'))
const ProfilePage = lazy(() => import('../features/settings/ProfilePage'))
const PreferencesPage = lazy(() => import('../features/settings/PreferencesPage'))
const CategoriesPage = lazy(() => import('../features/settings/CategoriesPage'))
const PaymentMethodsPage = lazy(() => import('../features/settings/PaymentMethodsPage'))
const SecurityPage = lazy(() => import('../features/settings/SecurityPage'))

function PublicOnly({ children }) {
  const { session, loading } = useAuth()
  if (loading) return null
  return session ? <Navigate to="/dashboard" replace /> : children
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-ink-soft">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
        <Route path="/forgot-password" element={<PublicOnly><ForgotPasswordPage /></PublicOnly>} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/income" element={<IncomePage />} />
          <Route path="/expenses" element={<ExpensesPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/bills" element={<BillsPage />} />
          <Route path="/bills/:id" element={<BillDetailPage />} />
          <Route path="/goals" element={<GoalsPage />} />
          <Route path="/lending" element={<Navigate to="/lending/given" replace />} />
          <Route path="/lending/given" element={<LendingGivenPage />} />
          <Route path="/lending/received" element={<LendingReceivedPage />} />
          <Route path="/lending/:id" element={<LendingDetailPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/pricing" element={<PricingPage />} />

          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/profile" replace />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="preferences" element={<PreferencesPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="payment-methods" element={<PaymentMethodsPage />} />
            <Route path="subscription" element={<SubscriptionPage />} />
            <Route path="security" element={<SecurityPage />} />
          </Route>
        </Route>

        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="users/:id" element={<AdminUserDetailsPage />} />
          <Route path="subscriptions" element={<AdminSubscriptionsPage />} />
          <Route path="custom-plans" element={<AdminCustomPlansPage />} />
          <Route path="plans" element={<AdminPlansPage />} />
          <Route path="payments" element={<AdminPaymentsPage />} />
          <Route path="audit-logs" element={<AdminAuditLogsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
