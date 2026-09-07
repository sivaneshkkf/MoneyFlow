import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Settings, ShieldCheck, Sparkles, Bell, ScrollText, KeyRound, Trash2, UserPlus,
  Users, Layers, ArrowRight, ChevronRight, Lock, User, LogOut, CreditCard, Info,
} from 'lucide-react'
import clsx from 'clsx'
import { Skeleton, Badge, ErrorState } from '../../../components/common'
import AdminSettingsCard from '../components/AdminSettingsCard'
import ConfirmAdminAction from '../components/ConfirmAdminAction'
import { useAdminAdmins, useAdminRoleMutations } from '../hooks/useAdminRoles'
import { useAdminPlans } from '../hooks/useAdminPlans'
import { useAdminAuditLogs } from '../hooks/useAdminAuditLogs'
import { getAdminUsers } from '../services/adminService'
import { useAdminAccess } from '../hooks/useAdmin'
import { auditActionMeta } from '../adminMeta'
import { useAuth } from '../../auth/AuthProvider'
import { useProfile } from '../../settings/useProfile'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatDate, formatRelative, formatCurrency } from '../../../utils/format'

const SECTIONS = [
  { key: 'general', label: 'General', icon: Settings, description: 'Application and admin information' },
  { key: 'security', label: 'Security', icon: ShieldCheck, description: 'Access and authentication' },
  { key: 'subscription', label: 'Subscription', icon: Sparkles, description: 'Plans and billing' },
  { key: 'notifications', label: 'Notifications', icon: Bell, description: 'System alerts' },
  { key: 'audit', label: 'Audit Logs', icon: ScrollText, description: 'Administrative activity' },
]

const QUICK_LINKS = [
  { to: '/admin/users', label: 'Manage Users', desc: 'View and manage customer accounts', icon: Users },
  { to: '/admin/subscriptions', label: 'Manage Subscriptions', desc: 'Review plans and billing status', icon: Sparkles },
  { to: '/admin/custom-plans', label: 'Custom Plans', desc: 'Create and manage user-specific offers', icon: Layers },
  { to: '/admin/audit-logs', label: 'Audit Logs', desc: 'Review administrative activity', icon: ScrollText },
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

function AdminRolesSection() {
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
                      className="rounded-lg p-2 text-ink-soft hover:bg-danger/10 hover:text-danger"
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
  const { isAdmin, isSuperAdmin } = useAdminAccess()
  const { user, signOut } = useAuth()
  const { data: profile } = useProfile()
  const { data: plans, isLoading: plansLoading } = useAdminPlans()
  const { data: auditData, isLoading: auditLoading, isError: auditError, refetch: refetchAudit } = useAdminAuditLogs({ limit: 5, offset: 0 })

  const roleLabel = isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin' : null
  const lastLog = auditData?.rows?.[0]

  return (
    <div>
      {/* header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-1 max-w-lg text-sm text-ink-soft">
            Manage your MoneyFlow Admin Console preferences, security, subscriptions, notifications and audit controls.
          </p>
        </div>
        {roleLabel && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/12 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-success">
            <ShieldCheck className="h-3.5 w-3.5" /> {roleLabel}
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* nav — horizontal scroll on mobile, compact vertical list on desktop */}
        <nav
          aria-label="Settings sections"
          className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0"
        >
          {SECTIONS.map((s) => {
            const active = section === s.key
            return (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition lg:w-full',
                  active ? 'bg-dark text-white shadow-sm dark:bg-brand-700' : 'text-ink-soft hover:bg-brand-50 dark:hover:bg-white/5',
                )}
              >
                <s.icon className="h-4 w-4 shrink-0" />
                <span className="lg:hidden">{s.label}</span>
                <span className="hidden min-w-0 lg:block">
                  <span className="block leading-tight">{s.label}</span>
                  <span className={clsx('block truncate text-[11px] font-normal leading-tight', active ? 'text-white/70' : 'text-ink-soft/70')}>
                    {s.description}
                  </span>
                </span>
              </button>
            )
          })}
        </nav>

        {/* content */}
        <div>
          {section === 'general' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminSettingsCard icon={Layers} title="Application" description="MoneyFlow platform administration and system controls.">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Application</dt>
                    <dd className="font-semibold">MoneyFlow</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Console</dt>
                    <dd className="font-semibold">Admin Console</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Environment</dt>
                    <dd className="font-semibold">{import.meta.env.PROD ? 'Production' : 'Development'}</dd>
                  </div>
                </dl>
              </AdminSettingsCard>

              <AdminSettingsCard icon={User} title="Your Admin Account" description="Signed-in account for this session.">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-900 dark:bg-white/10 dark:text-brand-400">
                    {(profile?.full_name || user?.email || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{profile?.full_name || 'Admin'}</p>
                    <p className="truncate text-xs text-ink-soft">{user?.email}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {roleLabel && <Badge tone={isSuperAdmin ? 'success' : 'info'}>{roleLabel.toUpperCase()}</Badge>}
                  <Link to="/settings/profile" className="btn-ghost !py-1.5 text-xs">
                    View Profile
                  </Link>
                </div>
              </AdminSettingsCard>

              <AdminSettingsCard icon={ShieldCheck} title="Admin Access" description="Your current level of access, enforced by the database.">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Role</dt>
                    <dd className="font-semibold">{roleLabel ?? '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Access</dt>
                    <dd className="text-right font-semibold">
                      {isSuperAdmin ? 'Full Administrative Access' : 'Standard Administrative Access'}
                    </dd>
                  </div>
                </dl>
              </AdminSettingsCard>

              <AdminSettingsCard icon={Sparkles} title="Quick Links" description="Jump straight to what you need.">
                <ul className="-mx-2 space-y-0.5">
                  {QUICK_LINKS.map((l) => (
                    <li key={l.to}>
                      <Link
                        to={l.to}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-brand-50 dark:hover:bg-white/5"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400">
                          <l.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold">{l.label}</span>
                          <span className="block truncate text-xs text-ink-soft">{l.desc}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-soft" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </AdminSettingsCard>
            </div>
          )}

          {section === 'security' && (
            <div className="space-y-4">
              <AdminSettingsCard icon={ShieldCheck} title="Administrative Access" description="How access is protected in this console.">
                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Current role</dt>
                    <dd className="font-semibold">{roleLabel ?? '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-soft">Authenticated as</dt>
                    <dd className="truncate font-semibold">{user?.email}</dd>
                  </div>
                </dl>
                <p className="mt-4 flex items-start gap-2 rounded-xl bg-info/[0.07] p-3 text-xs text-ink-soft dark:bg-info/10">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
                  Administrative actions are protected by database-enforced role checks (row-level security and
                  SECURITY DEFINER functions) — never by anything running in this browser.
                </p>
              </AdminSettingsCard>

              <AdminSettingsCard icon={Lock} title="Security Actions" description="Manage your own account's credentials and session.">
                <div className="flex flex-wrap gap-2">
                  <Link to="/settings/security" className="btn-ghost border border-line dark:border-white/10">
                    <KeyRound className="h-4 w-4" /> Change Password
                  </Link>
                  <button className="btn-ghost border border-line text-danger dark:border-white/10" onClick={signOut}>
                    <LogOut className="h-4 w-4" /> Sign Out
                  </button>
                </div>
              </AdminSettingsCard>

              <AdminSettingsCard icon={Users} title="Admin Roles" description="Everyone with Admin Console access.">
                <AdminRolesSection />
              </AdminSettingsCard>
            </div>
          )}

          {section === 'subscription' && (
            <div className="space-y-4">
              <AdminSettingsCard icon={Sparkles} title="Plans" description="Free, Pro and Custom, as configured in the database.">
                {plansLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(plans ?? []).map((p) => (
                      <div key={p.id} className="rounded-xl border border-line p-3 dark:border-white/10">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-semibold">{p.name}</span>
                          <Badge tone={p.is_active ? 'success' : 'neutral'}>{p.is_active ? 'Public' : 'Not public'}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-ink-soft">
                          {formatCurrency(p.price_monthly)}/mo · {formatCurrency(p.price_yearly)}/yr
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/admin/plans" className="btn-ghost border border-line dark:border-white/10">
                    <Layers className="h-4 w-4" /> Manage Plans
                  </Link>
                  <Link to="/admin/subscriptions" className="btn-ghost border border-line dark:border-white/10">
                    <Sparkles className="h-4 w-4" /> View Subscriptions
                  </Link>
                </div>
              </AdminSettingsCard>

              <AdminSettingsCard icon={CreditCard} title="Payment Provider" description="Razorpay">
                <p className="text-sm text-ink-soft">
                  Payment configuration is managed securely through server-side environment secrets — it is never
                  exposed to, or checkable from, the browser.
                </p>
              </AdminSettingsCard>
            </div>
          )}

          {section === 'notifications' && (
            <AdminSettingsCard icon={Bell} title="Notification Center" description="How MoneyFlow currently handles notifications.">
              <p className="text-sm text-ink-soft">
                Admin-specific notification preferences aren&apos;t available yet. System notifications for users —
                upcoming bills, budget alerts and more — are generated automatically and delivered through the
                notification bell in the main MoneyFlow app.
              </p>
              <p className="mt-3 text-sm text-ink-soft">
                Every sensitive administrative action is separately recorded in{' '}
                <button
                  type="button"
                  className="font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-400"
                  onClick={() => setSection('audit')}
                >
                  Audit Logs
                </button>
                .
              </p>
            </AdminSettingsCard>
          )}

          {section === 'audit' && (
            <div className="space-y-4">
              <AdminSettingsCard icon={ScrollText} title="Audit Logging" description="Administrative actions are recorded for accountability and security.">
                {auditError ? (
                  <ErrorState message="Unable to load audit log activity." onRetry={refetchAudit} />
                ) : auditLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-ink-soft">Total logged actions</p>
                      <p className="mt-1 text-xl font-bold">{(auditData?.total ?? 0).toLocaleString('en-IN')}</p>
                    </div>
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <p className="text-xs text-ink-soft">Last administrative action</p>
                      <p className="mt-1 truncate text-sm font-semibold">
                        {lastLog ? `${auditActionMeta(lastLog.action).label} · ${formatRelative(lastLog.created_at)}` : 'No activity yet'}
                      </p>
                    </div>
                  </div>
                )}
                <Link to="/admin/audit-logs" className="btn-ghost mt-4 border border-line dark:border-white/10">
                  View Audit Logs <ArrowRight className="h-4 w-4" />
                </Link>
              </AdminSettingsCard>

              <AdminSettingsCard icon={ScrollText} title="Recent Activity" description="The last few recorded administrative actions.">
                {auditLoading ? (
                  <Skeleton className="h-32 w-full" />
                ) : !auditData || auditData.rows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ink-soft">No admin activity yet.</p>
                ) : (
                  <ul className="divide-y divide-line dark:divide-white/5">
                    {auditData.rows.map((log) => {
                      const meta = auditActionMeta(log.action)
                      return (
                        <li key={log.log_id} className="flex items-center gap-3 py-2.5 text-sm">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-400">
                            <meta.icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {meta.label}
                            {log.target_email && <span className="text-ink-soft"> · {log.target_email}</span>}
                          </span>
                          <span className="shrink-0 text-xs text-ink-soft">{formatRelative(log.created_at)}</span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </AdminSettingsCard>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
