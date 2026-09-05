import {
  LayoutDashboard, Users, Sparkles, Layers, ShieldCheck, Settings,
  UserCheck, UserX, RefreshCw, Ban, PlayCircle, Wallet, KeyRound, Eye,
} from 'lucide-react'

export const ADMIN_NAV = [
  { label: 'Overview', items: [{ to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    label: 'Management',
    items: [
      { to: '/admin/users', label: 'Users', icon: Users },
      { to: '/admin/subscriptions', label: 'Subscriptions', icon: Sparkles },
      { to: '/admin/custom-plans', label: 'Custom Plans', icon: Sparkles },
      { to: '/admin/plans', label: 'Plans', icon: Layers },
      { to: '/admin/payments', label: 'Payments', icon: Wallet },
    ],
  },
  { label: 'Security', items: [{ to: '/admin/audit-logs', label: 'Audit Logs', icon: ShieldCheck }] },
  { label: 'System', items: [{ to: '/admin/settings', label: 'Settings', icon: Settings }] },
]

export const USER_STATUS_META = {
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'danger' },
}

export const SUBSCRIPTION_STATUS_META = {
  trialing: { label: 'Trial', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  past_due: { label: 'Past due', tone: 'warning' },
  paused: { label: 'Paused', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'danger' },
}

export const AUDIT_ACTION_META = {
  USER_SUSPENDED: { label: 'User suspended', icon: UserX, tone: 'danger' },
  USER_REACTIVATED: { label: 'User reactivated', icon: UserCheck, tone: 'success' },
  PLAN_CHANGED: { label: 'Plan changed', icon: RefreshCw, tone: 'info' },
  PLAN_UPDATED: { label: 'Plan updated', icon: Layers, tone: 'info' },
  SUBSCRIPTION_CANCELLED: { label: 'Subscription cancelled', icon: Ban, tone: 'warning' },
  SUBSCRIPTION_RESUMED: { label: 'Subscription resumed', icon: PlayCircle, tone: 'success' },
  ROLE_GRANTED: { label: 'Role granted', icon: KeyRound, tone: 'info' },
  ROLE_REVOKED: { label: 'Role revoked', icon: KeyRound, tone: 'warning' },
  FINANCIAL_DATA_VIEWED: { label: 'Financial data viewed', icon: Eye, tone: 'neutral' },
}

export function auditActionMeta(action) {
  return AUDIT_ACTION_META[action] ?? { label: action, icon: ShieldCheck, tone: 'neutral' }
}

export const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_META)

export const PAYMENT_EVENT_TYPES = [
  'checkout.completed',
  'subscription.activated',
  'invoice.paid',
  'subscription.renewed',
  'payment.failed',
  'invoice.payment_failed',
  'subscription.paused',
  'subscription.cancelled',
  'subscription.expired',
]

export const PAGE_SIZE = 20
