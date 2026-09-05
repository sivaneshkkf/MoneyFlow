import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Settings, ShieldCheck, Sparkles, Bell, ScrollText, KeyRound, Trash2, UserPlus } from 'lucide-react'
import clsx from 'clsx'
import { Skeleton, Badge } from '../../../components/common'
import ConfirmAdminAction from '../components/ConfirmAdminAction'
import { useAdminAdmins, useAdminRoleMutations } from '../hooks/useAdminRoles'
import { getAdminUsers } from '../services/adminService'
import { useAdminAccess } from '../hooks/useAdmin'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatDate } from '../../../utils/format'

const SECTIONS = [
  { key: 'general', label: 'General', icon: Settings },
  { key: 'security', label: 'Security', icon: ShieldCheck },
  { key: 'subscription', label: 'Subscription', icon: Sparkles },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'audit', label: 'Audit Logs', icon: ScrollText },
]

const ROLE_LABEL = { admin: 'Admin', super_admin: 'Super Admin' }

function GrantAdminForm({ admins, onGranted }) {
  const toast = useToast()
  const { grant, revoke } = useAdminRoleMutations()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('admin')
  const [searching, setSearching] = useState(false)
  const [pendingSwap, setPendingSwap] = useState(null) // { match, existingRoles, role }

  const doGrant = async (match, targetRole) => {
    await grant.mutateAsync({ userId: match.user_id, role: targetRole, reason: 'Granted via Admin Settings' })
    toast.success(`${ROLE_LABEL[targetRole]} access granted to ${match.email}.`)
    setEmail('')
    onGranted?.()
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setSearching(true)
    try {
      const { rows } = await getAdminUsers({ search: email.trim(), limit: 1 })
      const match = rows[0]
      if (!match) {
        toast.error('No user found with that email.')
        return
      }

      const existingRoles = (admins ?? []).filter((a) => a.user_id === match.user_id).map((a) => a.role)

      if (existingRoles.includes(role)) {
        toast.info(`${match.email} already has ${ROLE_LABEL[role]} access.`)
        return
      }
      if (existingRoles.length > 0) {
        // Don't stack a second role on top — offer to replace the existing
        // one(s) instead, so the admin list never ends up with a redundant
        // duplicate entry for the same person.
        setPendingSwap({ match, existingRoles, role })
        return
      }

      await doGrant(match, role)
    } catch (err) {
      toast.error(friendlyError(err))
    } finally {
      setSearching(false)
    }
  }

  const confirmSwap = async (reason) => {
    const { match, existingRoles, role: targetRole } = pendingSwap
    try {
      for (const oldRole of existingRoles) {
        await revoke.mutateAsync({ userId: match.user_id, role: oldRole, reason: reason || 'Replaced via Admin Settings' })
      }
      await doGrant(match, targetRole)
      setPendingSwap(null)
    } catch (err) {
      toast.error(friendlyError(err))
    }
  }

  return (
    <>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          className="input flex-1"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="admin">Admin</option>
          <option value="super_admin">Super Admin</option>
        </select>
        <button type="submit" className="btn-primary shrink-0" disabled={searching || grant.isPending}>
          <UserPlus className="h-4 w-4" /> Grant
        </button>
      </form>

      <ConfirmAdminAction
        open={Boolean(pendingSwap)}
        onClose={() => setPendingSwap(null)}
        loading={revoke.isPending || grant.isPending}
        tone="primary"
        title={`Replace ${pendingSwap?.match.full_name || pendingSwap?.match.email}'s role?`}
        message={
          pendingSwap
            ? `${pendingSwap.match.email} currently has ${pendingSwap.existingRoles.map((r) => ROLE_LABEL[r]).join(' & ')}. ` +
              `This will remove that and grant ${ROLE_LABEL[pendingSwap.role]} instead.`
            : undefined
        }
        confirmLabel="Replace role"
        onConfirm={confirmSwap}
      />
    </>
  )
}

function SecuritySection() {
  const { data: admins, isLoading } = useAdminAdmins()
  const { isSuperAdmin } = useAdminAccess()
  const { revoke } = useAdminRoleMutations()
  const toast = useToast()
  const [target, setTarget] = useState(null)

  const doRevoke = async (reason) => {
    try {
      await revoke.mutateAsync({ userId: target.user_id, role: target.role, reason })
      toast.success('Role revoked.')
      setTarget(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  return (
    <div className="space-y-5">
      {isSuperAdmin && (
        <div>
          <p className="label mb-1.5">Grant admin access</p>
          <GrantAdminForm admins={admins} />
        </div>
      )}

      <div>
        <p className="label mb-1.5">Current admins</p>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line dark:divide-white/5 dark:border-white/10">
            {(admins ?? []).map((a) => (
              <li key={`${a.user_id}-${a.role}`} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.full_name || a.email}</p>
                  <p className="truncate text-xs text-ink-soft">
                    {a.email} · granted {formatDate(a.granted_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={a.role === 'super_admin' ? 'success' : 'info'}>{a.role === 'super_admin' ? 'Super Admin' : 'Admin'}</Badge>
                  {isSuperAdmin && (
                    <button
                      className="rounded-lg p-1.5 text-ink-soft hover:bg-danger/10 hover:text-danger"
                      onClick={() => setTarget(a)}
                      aria-label={`Revoke ${a.role} from ${a.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
            {(admins ?? []).length === 0 && <li className="p-6 text-center text-sm text-ink-soft">No admins found.</li>}
          </ul>
        )}
      </div>

      <ConfirmAdminAction
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        loading={revoke.isPending}
        title={`Revoke ${target?.role === 'super_admin' ? 'Super Admin' : 'Admin'} from ${target?.email}?`}
        message="They will immediately lose access to the Admin Console. The last Super Admin cannot be revoked."
        confirmLabel="Revoke access"
        onConfirm={doRevoke}
      />
    </div>
  )
}

export default function AdminSettingsPage() {
  const [section, setSection] = useState('general')

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <div>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Settings</h1>
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={clsx(
                'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition',
                section === s.key ? 'bg-dark text-white dark:bg-brand-700' : 'text-ink-soft hover:bg-brand-50 dark:hover:bg-white/5',
              )}
            >
              <s.icon className="h-4 w-4" /> {s.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="card p-6">
        {section === 'general' && (
          <div className="space-y-3 text-sm">
            <h2 className="text-base font-bold">General</h2>
            <p className="text-ink-soft">MoneyFlow Admin Console — role-based, database-enforced access.</p>
          </div>
        )}

        {section === 'security' && (
          <div className="space-y-3">
            <h2 className="text-base font-bold">Security &amp; Roles</h2>
            <SecuritySection />
          </div>
        )}

        {section === 'subscription' && (
          <div className="space-y-3 text-sm">
            <h2 className="text-base font-bold">Subscription</h2>
            <p className="text-ink-soft">Manage what Free and Pro include, and review every user&apos;s billing status.</p>
            <div className="flex gap-2">
              <Link to="/admin/plans" className="btn-ghost">
                <Sparkles className="h-4 w-4" /> Manage Plans
              </Link>
              <Link to="/admin/subscriptions" className="btn-ghost">
                Manage Subscriptions
              </Link>
            </div>
          </div>
        )}

        {section === 'notifications' && (
          <div className="space-y-2 text-sm">
            <h2 className="text-base font-bold">Notifications</h2>
            <p className="text-ink-soft">Admin notification preferences aren&apos;t available yet.</p>
          </div>
        )}

        {section === 'audit' && (
          <div className="space-y-3 text-sm">
            <h2 className="text-base font-bold">Audit Logs</h2>
            <p className="text-ink-soft">Every sensitive admin action is recorded automatically.</p>
            <Link to="/admin/audit-logs" className="btn-ghost">
              <KeyRound className="h-4 w-4" /> View Audit Logs
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
