import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff, ShieldCheck, CloudUpload, LockKeyhole } from 'lucide-react'
import AuthShell from './AuthShell'
import GoogleButton from './GoogleButton'
import { useAuth } from './AuthProvider'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  remember: z.boolean().optional(),
})

const TRUST = [
  { icon: ShieldCheck, title: 'Bank-level security', body: '256-bit encryption' },
  { icon: CloudUpload, title: 'Auto backup', body: 'Never lose data' },
  { icon: LockKeyhole, title: '100% private', body: 'Your data, your control' },
]

export default function LoginPage() {
  const { signInWithPassword } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async ({ email, password }) => {
    try {
      const { error } = await signInWithPassword(email, password)
      if (error) {
        toast.error(friendlyError(error, 'Incorrect email or password.'))
        return
      }
      toast.success('Welcome back!')
      navigate('/dashboard')
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to sign in right now.'))
    }
  }

  return (
    <AuthShell title="Welcome back 👋" subtitle="Sign in to continue to MoneyFlow.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input id="email" type="email" autoComplete="email" className="input pl-10" {...register('email')} />
          </div>
          {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link to="/forgot-password" className="text-xs font-semibold text-brand-700 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="input px-10"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" defaultChecked {...register('remember')} className="h-4 w-4 rounded border-line accent-brand-600" />
          Remember me
        </label>

        <button type="submit" className="btn-primary w-full !py-3" disabled={isSubmitting}>
          <Lock className="h-4 w-4" />
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      <GoogleButton />

      <p className="mt-5 text-center text-sm text-ink-soft">
        New here?{' '}
        <Link to="/register" className="font-semibold text-brand-700 hover:underline">
          Create an account
        </Link>
      </p>

      <div className="mt-6 grid grid-cols-3 gap-2 rounded-xl border border-line p-3 dark:border-white/10">
        {TRUST.map((t) => (
          <div key={t.title} className="flex items-start gap-2">
            <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold leading-tight">{t.title}</p>
              <p className="text-[10px] leading-tight text-ink-soft">{t.body}</p>
            </div>
          </div>
        ))}
      </div>
    </AuthShell>
  )
}
