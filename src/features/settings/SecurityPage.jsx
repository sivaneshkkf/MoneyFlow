import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Lock, Eye, EyeOff, ShieldCheck, ArrowRight, LogOut, KeyRound } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../auth/AuthProvider'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' })

function scorePassword(pw = '') {
  let score = 0
  if (pw.length >= 8) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  return score
}
const STRENGTH = [
  { label: 'Password strength', color: 'bg-line', bars: 0 },
  { label: 'Weak', color: 'bg-danger', bars: 1 },
  { label: 'Fair', color: 'bg-warning', bars: 2 },
  { label: 'Good', color: 'bg-info', bars: 3 },
  { label: 'Strong', color: 'bg-success', bars: 4 },
]

const PROMISES = [
  [ShieldCheck, 'Your data is encrypted'],
  [KeyRound, 'We never share your information'],
  [Lock, "You're in control of your account"],
]

function PasswordInput({ register, name, placeholder, error }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <input
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder={placeholder}
          className="input pl-10 pr-10"
          {...register(name)}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-soft hover:bg-brand-50 hover:text-ink dark:hover:bg-white/5"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  )
}

export default function SecurityPage() {
  const { updatePassword, signOut, user } = useAuth()
  const toast = useToast()
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } })

  const pw = watch('password') || ''
  const strength = STRENGTH[pw ? scorePassword(pw) : 0]

  const onSubmit = async ({ password }) => {
    try {
      const { error } = await updatePassword(password)
      if (error) throw error
      toast.success('Password changed.')
      reset()
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to change your password.'))
    }
  }

  return (
    <div className="grid gap-x-10 gap-y-8 lg:grid-cols-[1.6fr_1fr]">
      {/* --- left: forms --- */}
      <div className="space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} className="card p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/12 text-success">
              <Lock className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-bold">Change password</h2>
              <p className="text-xs text-ink-soft">Choose a strong password to keep your account secure.</p>
            </div>
          </div>

          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label className="text-sm font-semibold">New password</label>
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <ShieldCheck className="h-3.5 w-3.5" /> Use at least 8 characters
            </span>
          </div>
          <PasswordInput register={register} name="password" placeholder="Enter new password" error={errors.password?.message} />

          <div className="mt-3 flex items-center gap-3">
            <div className="flex flex-1 gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={clsx('h-1.5 flex-1 rounded-full transition-colors', i < strength.bars ? strength.color : 'bg-line dark:bg-white/10')}
                />
              ))}
            </div>
            <span className="shrink-0 text-xs text-ink-soft">{strength.label}</span>
          </div>

          <label className="mb-1.5 mt-5 block text-sm font-semibold">Confirm new password</label>
          <PasswordInput register={register} name="confirm" placeholder="Confirm new password" error={errors.confirm?.message} />

          <div className="mt-6 flex justify-end">
            <button className="btn-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating…' : 'Update password'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>

        <div className="card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-danger/10 text-danger">
              <LogOut className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold">Sign out</h3>
              <p className="text-xs text-ink-soft">Sign out from your account on this device.</p>
              <p className="mt-1 text-sm font-medium">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-danger/10 px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/15"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </div>

      {/* --- right: reassurance --- */}
      <aside className="lg:border-l lg:border-line lg:pl-10 lg:dark:border-white/10">
        <img
          src="/lockImg.png"
          alt=""
          aria-hidden="true"
          className="mx-auto w-56 max-w-full select-none object-contain"
        />
        <h3 className="mt-4 text-center text-xl font-bold">Your security matters</h3>
        <p className="mx-auto mt-2 max-w-xs text-center text-sm text-ink-soft">
          Keep your account secure by using a strong password and never share your credentials with anyone.
        </p>
        <ul className="mt-6 space-y-3 rounded-2xl bg-success/[0.07] p-4 dark:bg-success/10">
          {PROMISES.map(([Icon, text]) => (
            <li key={text} className="flex items-center gap-2.5 text-sm">
              <Icon className="h-4 w-4 shrink-0 text-success" />
              {text}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
