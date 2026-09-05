import { useState } from 'react'
import { Pencil, Check, X, Layers } from 'lucide-react'
import { Skeleton, ErrorState, Badge } from '../../../components/common'
import PlanEditorModal from '../components/PlanEditorModal'
import { useAdminPlans, useAdminPlanMutations } from '../hooks/useAdminPlans'
import { useToast } from '../../../components/common/ToastProvider'
import { friendlyError } from '../../../utils/errors'
import { formatCurrency } from '../../../utils/format'
import { FEATURE_LABEL, RESOURCE_LABEL, isUnlimited } from '../../subscription/subscriptionMeta'

export default function AdminPlansPage() {
  const { data: plans, isLoading, isError, refetch } = useAdminPlans()
  const { update } = useAdminPlanMutations()
  const toast = useToast()
  const [editing, setEditing] = useState(null)

  const save = async (payload) => {
    try {
      await update.mutateAsync(payload)
      toast.success('Plan updated.')
      setEditing(null)
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />
  if (isError) return <ErrorState message="Unable to load plans." onRetry={refetch} />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Plans</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Edit pricing, features and limits. Changes apply to new and future billing — existing billing history is never rewritten.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {(plans ?? []).map((plan) => (
          <div key={plan.id} className="card p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold uppercase tracking-wide">{plan.name}</h2>
                  {!plan.is_active && <Badge tone="neutral">Inactive</Badge>}
                </div>
                <p className="mt-1 text-sm text-ink-soft">{plan.description}</p>
              </div>
              <button className="btn-ghost !py-1.5 text-xs" onClick={() => setEditing(plan)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            </div>

            <div className="mb-4 flex items-baseline gap-4">
              <span className="text-2xl font-extrabold">{formatCurrency(plan.price_monthly)}<span className="text-sm font-normal text-ink-soft">/mo</span></span>
              <span className="text-sm text-ink-soft">{formatCurrency(plan.price_yearly)}/yr</span>
            </div>

            <div className="space-y-1.5">
              {Object.keys(RESOURCE_LABEL).map((key) => (
                <div key={key} className="flex items-center justify-between text-xs">
                  <span className="text-ink-soft">{RESOURCE_LABEL[key]}</span>
                  <span className="font-medium">{isUnlimited(plan.limits?.[key]) ? 'Unlimited' : plan.limits?.[key]}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {Object.keys(FEATURE_LABEL).map((key) => (
                <span
                  key={key}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    plan.features?.[key] ? 'bg-success/10 text-success' : 'bg-ink-soft/10 text-ink-soft'
                  }`}
                >
                  {plan.features?.[key] ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                  {FEATURE_LABEL[key]}
                </span>
              ))}
            </div>
          </div>
        ))}
        {(plans ?? []).length === 0 && (
          <div className="sm:col-span-2">
            <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
              <Layers className="mb-3 h-6 w-6 text-ink-soft" />
              <p className="text-sm font-semibold">No plans configured</p>
            </div>
          </div>
        )}
      </div>

      <PlanEditorModal open={Boolean(editing)} onClose={() => setEditing(null)} plan={editing} onSubmit={save} loading={update.isPending} />
    </div>
  )
}
