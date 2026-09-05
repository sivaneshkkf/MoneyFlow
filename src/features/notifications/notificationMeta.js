import { AlertTriangle, BellRing, CircleCheck, CircleAlert, Info, Sparkles } from 'lucide-react'

// alert.type / severity → presentation
export const ALERT_META = {
  bill_due: { icon: BellRing, tone: 'info' },
  bill_overdue: { icon: AlertTriangle, tone: 'warning' },
  payment_failed: { icon: CircleAlert, tone: 'danger' },
  payment_recorded: { icon: CircleCheck, tone: 'success' },
  CUSTOM_PLAN_OFFER_READY: { icon: Sparkles, tone: 'success' },
  CUSTOM_PLAN_DIRECT_OFFER_CREATED: { icon: Sparkles, tone: 'success' },
}

export function alertMeta(alert) {
  const base = ALERT_META[alert?.type]
  if (base) return base
  const bySeverity = {
    success: { icon: CircleCheck, tone: 'success' },
    warning: { icon: AlertTriangle, tone: 'warning' },
    danger: { icon: CircleAlert, tone: 'danger' },
    error: { icon: CircleAlert, tone: 'danger' },
    info: { icon: Info, tone: 'info' },
  }
  return bySeverity[alert?.severity] ?? { icon: Info, tone: 'info' }
}

export const TONE_CLASS = {
  info: 'bg-info/10 text-info',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
}
