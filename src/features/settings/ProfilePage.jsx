import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import {
  User,
  Mail,
  IndianRupee,
  Globe,
  Camera,
  Info,
  Lightbulb,
  Coins,
  Clock,
  Sprout,
  Save,
} from 'lucide-react'
import { Skeleton } from '../../components/common'
import { useProfile, useUpdateProfile, useUploadAvatar } from './useProfile'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York']
const CURRENCIES = [
  ['INR', 'INR — ₹'],
  ['USD', 'USD — $'],
  ['EUR', 'EUR — €'],
  ['GBP', 'GBP — £'],
]

function IconField({ label, icon: Icon, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        {children}
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const { data: profile, isLoading } = useProfile()
  const update = useUpdateProfile()
  const uploadAvatar = useUploadAvatar()
  const toast = useToast()
  const fileRef = useRef(null)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { isSubmitting, isDirty },
  } = useForm()

  useEffect(() => {
    if (profile) {
      reset({
        full_name: profile.full_name ?? '',
        currency: profile.currency ?? 'INR',
        timezone: profile.timezone ?? 'Asia/Kolkata',
      })
    }
  }, [profile, reset])

  const onSubmit = async (values) => {
    try {
      await update.mutateAsync(values)
      reset(values)
      toast.success('Profile updated.')
    } catch (e) {
      toast.error(friendlyError(e))
    }
  }

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await uploadAvatar.mutateAsync(file)
      toast.success('Photo updated.')
    } catch (err) {
      toast.error(friendlyError(err, 'Unable to upload the photo.'))
    }
  }

  if (isLoading) return <Skeleton className="h-64 w-full" />

  const name = watch('full_name') || profile?.full_name || 'You'
  const currencyLabel = CURRENCIES.find(([k]) => k === (watch('currency') || profile?.currency))?.[1] ?? 'INR — ₹'
  const tz = watch('timezone') || profile?.timezone || 'Asia/Kolkata'

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      {/* --- form --- */}
      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-success/12 text-success">
            <User className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold">Profile Information</h2>
            <p className="text-xs text-ink-soft">Keep your personal information up to date.</p>
          </div>
        </div>

        <IconField label="Full name" icon={User}>
          <input className="input pl-10" {...register('full_name')} />
        </IconField>

        <IconField label="Email address" icon={Mail}>
          <input className="input pl-10 opacity-70" value={profile?.email ?? ''} disabled readOnly />
        </IconField>

        <div className="grid gap-4 sm:grid-cols-2">
          <IconField label="Currency" icon={IndianRupee}>
            <select className="input pl-10" {...register('currency')}>
              {CURRENCIES.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </IconField>
          <IconField label="Timezone" icon={Globe}>
            <select className="input pl-10" {...register('timezone')}>
              {TIMEZONES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </IconField>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl bg-info/[0.07] p-3 text-xs text-ink-soft dark:bg-info/10">
          <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-info text-white">
            <Info className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
          Currency display is optimised for INR (en-IN) in this release.
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              reset({
                full_name: profile?.full_name ?? '',
                currency: profile?.currency ?? 'INR',
                timezone: profile?.timezone ?? 'Asia/Kolkata',
              })
            }
            disabled={!isDirty}
          >
            Cancel
          </button>
          <button className="btn-primary" type="submit" disabled={isSubmitting || !isDirty}>
            <Save className="h-4 w-4" />
            {isSubmitting ? 'Saving…' : 'Save profile'}
          </button>
        </div>
      </form>

      {/* --- side --- */}
      <div className="flex flex-col gap-6">
        <div className="relative overflow-hidden rounded-2xl border border-success/20 bg-gradient-to-br from-success/[0.12] via-success/[0.05] to-white p-6 dark:to-[#161F1D]">
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 border-white bg-success/15 text-2xl font-bold text-success dark:border-white/10">
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  name.charAt(0).toUpperCase()
                )}
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadAvatar.isPending}
                aria-label="Change photo"
                className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-dark text-white shadow-md transition hover:bg-brand-700"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{name}</p>
              <p className="truncate text-sm text-ink-soft">{profile?.email}</p>
              <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                <User className="h-3 w-3" /> Personal Account
              </span>
            </div>
          </div>
          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-sm italic text-ink-soft">
            “Better money habits for a brighter tomorrow”
            <Sprout className="h-4 w-4 text-success" />
          </p>
        </div>

        <div className="card flex flex-1 flex-col p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-success/12 text-success">
              <Lightbulb className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-bold">Quick Info</h3>
              <p className="text-xs text-ink-soft">Keep your details accurate for better insights.</p>
            </div>
          </div>
          <dl className="mt-4 flex flex-1 flex-col divide-y divide-line dark:divide-white/5">
            {[
              [Coins, 'Selected currency', currencyLabel],
              [Globe, 'Timezone', tz],
              [Clock, 'Date format', 'dd/mm/yyyy'],
            ].map(([Icon, label, value]) => (
              <div key={label} className="flex flex-1 items-center justify-between gap-3 py-3">
                <dt className="flex items-center gap-2.5 text-sm text-ink-soft">
                  <Icon className="h-4 w-4" />
                  {label}
                </dt>
                <dd className="text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
