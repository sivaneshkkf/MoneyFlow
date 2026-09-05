import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, UserX, UserCheck, RefreshCw, Ban, PlayCircle, Eye, EyeOff } from 'lucide-react'
import { Skeleton, ErrorState, Badge } from '../../../components/common'
import Modal from '../../../components/common/Modal'
import ConfirmAdminAction from '../components/ConfirmAdminAction'
import UsageProgress from '../../subscription/components/UsageProgress'
import UserStatusBadge from '../components/UserStatusBadge'
import SubscriptionStatusBadge from '../components/SubscriptionStatusBadge'
import { useAdminUserDetails, useAdminUserMutations } from '../hooks/useAdminUsers'
import { useAdminPlans } from '../hooks/useAdminPlans'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatCurrency, formatDate, formatRelative } from '../../../utils/format'

const USAGE_ORDER = ['accounts', 'transactions_per_month', 'budgets', 'bills', 'lending_records']

function ChangePlanModal({ open, onClose, plans, current, onSubmit, loading }) {
  const [planSlug, setPlanSlug] = useState(current ?? 'pro')
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [reason, setReason] = useState('')

  return (
    <Modal open={open} onClose={onClose} title="Change plan" size="sm">
      <div className="space-y-4">
        <div>
          <label className="label">Plan</label>
          <select className="input" value={planSlug} onChange={(e) => setPlanSlug(e.target.value)}>
            {(plans ?? []).map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Billing cycle</label>
          <select className="input" value={billingCycle} onChange={(e) => setBillingCycle(e.target.value)}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <label className="label">Reason (optional)</label>
          <textarea className="input resize-y" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer requested upgrade" />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button className="btn-primary" onClick={() => onSubmit({ planSlug, billingCycle, reason: reason.trim() || null })} disabled={loading}>
          {loading ? 'Saving…' : 'Confirm change'}
        </button>
      </div>
    </Modal>
  )
}

export default function AdminUserDetailsPage() {
  const { id } = useParams()
  const toast = useToast()
  const { user, usage, isLoading, isError, refetch } = useAdminUserDetails(id)
  const { data: plans } = useAdminPlans()
  const { suspend, reactivate, changePlan, cancelSubscription, resumeSubscription, loadFinancialData } = useAdminUserMutations(id)

  const [confirmAction, setConfirmAction] = useState(null) // 'suspend' | 'reactivate' | 'cancel' | 'resume'
  const [planModalOpen, setPlanModalOpen] = useState(false)
  const [financialData, setFinancialData] = useState(null)

  const act = async (fn, msg) => {
    try {
      await fn()
      toast.success(msg)
      setConfirmAction(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const toggleFinancialData = async () => {
    if (financialData) {
      setFinancialData(null)
      return
    }
    try {
      const data = await loadFinancialData.mutateAsync(id)
      setFinancialData(data)
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to load financial data.'))
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (isError || !user) return <ErrorState message="Unable to load this user." onRetry={refetch} />

  const isPro = user.plan_slug === 'pro'
  const isSuspended = user.status === 'suspended'

  return (
    <div className="space-y-6">
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-100 text-lg font-bold text-brand-900">
              {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-lg font-bold">{user.full_name || 'Unnamed user'}</h1>
              <p className="text-sm text-ink-soft">{user.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral">{(user.plan_name ?? 'Free').toUpperCase()}</Badge>
                <UserStatusBadge status={user.status} />
                <SubscriptionStatusBadge status={user.subscription_status} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setPlanModalOpen(true)}>
              <RefreshCw className="h-4 w-4" /> Change plan
            </button>
            {isPro && !user.cancel_at_period_end && user.subscription_status !== 'cancelled' && (
              <button className="btn-ghost" onClick={() => setConfirmAction('cancel')}>
                <Ban className="h-4 w-4" /> Cancel subscription
              </button>
            )}
            {isPro && user.cancel_at_period_end && (
              <button className="btn-ghost" onClick={() => setConfirmAction('resume')}>
                <PlayCircle className="h-4 w-4" /> Resume subscription
              </button>
            )}
            {isSuspended ? (
              <button className="btn-primary" onClick={() => setConfirmAction('reactivate')}>
                <UserCheck className="h-4 w-4" /> Reactivate
              </button>
            ) : (
              <button className="btn bg-danger text-white hover:bg-danger/90" onClick={() => setConfirmAction('suspend')}>
                <UserX className="h-4 w-4" /> Suspend
              </button>
            )}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-ink-soft">Joined</dt>
            <dd className="text-sm font-semibold">{formatDate(user.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Last active</dt>
            <dd className="text-sm font-semibold">{user.last_sign_in_at ? formatRelative(user.last_sign_in_at) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Billing cycle</dt>
            <dd className="text-sm font-semibold capitalize">{user.billing_cycle ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">{user.cancel_at_period_end ? 'Access ends' : 'Renews'}</dt>
            <dd className="text-sm font-semibold">{user.current_period_end ? formatDate(user.current_period_end) : '—'}</dd>
          </div>
        </dl>
      </div>

      <div className="card p-6">
        <h2 className="mb-4 text-base font-bold">Usage</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {USAGE_ORDER.map((resource) => (
            <UsageProgress key={resource} resource={resource} usage={usage.find((u) => u.resource === resource)} />
          ))}
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">Financial Data</h2>
            <p className="text-xs text-ink-soft">Hidden by default. Viewing it is recorded in the audit log.</p>
          </div>
          <button className="btn-ghost" onClick={toggleFinancialData} disabled={loadFinancialData.isPending}>
            {financialData ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {loadFinancialData.isPending ? 'Loading…' : financialData ? 'Hide' : 'View Financial Data'}
          </button>
        </div>
        {financialData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-ink-soft">Accounts</p>
                <p className="text-sm font-bold">{financialData.account_count}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Total balance</p>
                <p className="text-sm font-bold">{formatCurrency(financialData.total_balance)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Active bills</p>
                <p className="text-sm font-bold">{financialData.active_bills}</p>
              </div>
              <div>
                <p className="text-xs text-ink-soft">Lending outstanding</p>
                <p className="text-sm font-bold">{formatCurrency(financialData.lending_outstanding)}</p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">Recent transactions</p>
              {financialData.recent_transactions.length === 0 ? (
                <p className="text-sm text-ink-soft">No transactions.</p>
              ) : (
                <ul className="divide-y divide-line text-sm dark:divide-white/5">
                  {financialData.recent_transactions.map((t, i) => (
                    <li key={i} className="flex items-center justify-between py-2">
                      <span className="truncate text-ink-soft">{t.description || '—'} · {formatDate(t.transaction_date)}</span>
                      <span className={t.type === 'income' ? 'font-semibold text-success' : 'font-semibold text-danger'}>
                        {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <ChangePlanModal
        open={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        plans={plans}
        current={user.plan_slug}
        loading={changePlan.isPending}
        onSubmit={(payload) =>
          act(() => changePlan.mutateAsync({ userId: id, ...payload }), 'Plan changed.').then(() => setPlanModalOpen(false))
        }
      />

      <ConfirmAdminAction
        open={confirmAction === 'suspend'}
        onClose={() => setConfirmAction(null)}
        loading={suspend.isPending}
        title={`Suspend ${user.full_name || user.email}?`}
        message="They will be signed out and unable to sign back in until reactivated."
        confirmLabel="Suspend user"
        onConfirm={(reason) => act(() => suspend.mutateAsync({ userId: id, reason }), 'User suspended.')}
      />
      <ConfirmAdminAction
        open={confirmAction === 'reactivate'}
        onClose={() => setConfirmAction(null)}
        loading={reactivate.isPending}
        tone="primary"
        title={`Reactivate ${user.full_name || user.email}?`}
        message="They will be able to sign in again immediately."
        confirmLabel="Reactivate user"
        onConfirm={(reason) => act(() => reactivate.mutateAsync({ userId: id, reason }), 'User reactivated.')}
      />
      <ConfirmAdminAction
        open={confirmAction === 'cancel'}
        onClose={() => setConfirmAction(null)}
        loading={cancelSubscription.isPending}
        title="Cancel this subscription?"
        message="Pro access will remain active until the current billing period ends."
        confirmLabel="Cancel subscription"
        onConfirm={(reason) => act(() => cancelSubscription.mutateAsync({ userId: id, reason }), 'Subscription cancelled.')}
      />
      <ConfirmAdminAction
        open={confirmAction === 'resume'}
        onClose={() => setConfirmAction(null)}
        loading={resumeSubscription.isPending}
        tone="primary"
        title="Resume this subscription?"
        message="The pending cancellation will be reverted and billing will continue as normal."
        confirmLabel="Resume subscription"
        onConfirm={(reason) => act(() => resumeSubscription.mutateAsync({ userId: id, reason }), 'Subscription resumed.')}
      />
    </div>
  )
}
