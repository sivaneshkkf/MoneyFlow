// Small, presentation-only constants. Prices/features/limits themselves come
// from the database (subscription_plans) via useSubscription — never
// hardcoded here. This file only maps codes to labels/icons/copy.
import { Sparkles, Clock, AlertTriangle, PauseCircle, Ban, XCircle } from 'lucide-react'

export const RESOURCE_LABEL = {
  accounts: 'Accounts',
  budgets: 'Budgets',
  bills: 'Bills & Recurring',
  lending_records: 'Lending records',
  transactions_per_month: 'Transactions this month',
}

export const FEATURE_LABEL = {
  advanced_analytics: 'Advanced Analytics',
  advanced_reports: 'Advanced Reports',
  pdf_reports: 'PDF Reports',
  csv_export: 'CSV Export',
  financial_insights: 'Financial Insights',
}

export const STATUS_META = {
  trialing: { label: 'Trial', tone: 'info', icon: Clock },
  active: { label: 'Active', tone: 'success', icon: Sparkles },
  past_due: { label: 'Payment due', tone: 'warning', icon: AlertTriangle },
  paused: { label: 'Paused', tone: 'neutral', icon: PauseCircle },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: Ban },
  expired: { label: 'Expired', tone: 'danger', icon: XCircle },
}

export const UNLIMITED = -1
export const isUnlimited = (n) => n == null || Number(n) === UNLIMITED

/** Parse the trigger-raised `PLAN_LIMIT:<resource>` error into a resource key, or null. */
export function planLimitResource(error) {
  const msg = typeof error === 'string' ? error : error?.message || ''
  const m = /^PLAN_LIMIT:(.+)$/.exec(msg)
  return m ? m[1] : null
}

/** Human bullet list for a plan card, built entirely from its DB row — no hardcoded copy per plan. */
export function planFeatureList(plan) {
  if (!plan) return []
  const limits = plan.limits ?? {}
  const features = plan.features ?? {}
  const limitLine = (key, label) => {
    const v = limits[key]
    return isUnlimited(v) ? `Unlimited ${label}` : `Up to ${v} ${label}`
  }
  const lines = [
    limitLine('accounts', 'accounts'),
    limitLine('transactions_per_month', 'transactions / month'),
    limitLine('budgets', 'budgets'),
    limitLine('bills', 'active bills & recurring payments'),
    limitLine('lending_records', 'active lending records'),
  ]
  for (const [key, enabled] of Object.entries(features)) {
    if (enabled) lines.push(FEATURE_LABEL[key] ?? key)
  }
  return lines
}
