import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import AuthShell from './AuthShell'
import GoogleButton from './GoogleButton'
import { useAuth } from './AuthProvider'
import { useToast } from '../../components/common/ToastProvider'
import { friendlyError } from '../../utils/errors'

const schema = z.object({
  fullName: z.string().min(2, 'Enter your name'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export default function RegisterPage() {
  const { signUp } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async ({ fullName, email, password }) => {
    try {
      const { data, error } = await signUp(email, password, fullName)
      if (error) {
        toast.error(friendlyError(error, 'Unable to create your account.'))
        return
      }
      if (data.session) {
        toast.success('Account created!')
        navigate('/dashboard')
      } else {
        toast.success('Check your email to verify your account.')
        navigate('/login')
      }
    } catch (e) {
      toast.error(friendlyError(e, 'Unable to create your account.'))
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start tracking your money in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label" htmlFor="fullName">Full name</label>
          <input id="fullName" className="input" {...register('fullName')} />
          {errors.fullName && <p className="mt-1 text-xs text-danger">{errors.fullName.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" {...register('email')} />
          {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" {...register('password')} />
          {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <div className="my-4 flex items-center gap-3 text-xs text-ink-soft">
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>
      <GoogleButton label="Sign up with Google" />
    </AuthShell>
  )
}
