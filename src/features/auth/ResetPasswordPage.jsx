import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import AuthShell from './AuthShell'
import { useAuth } from './AuthProvider'
import { useToast } from '../../components/common/ToastProvider'

const schema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export default function ResetPasswordPage() {
  const { updatePassword } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async ({ password }) => {
    const { error } = await updatePassword(password)
    if (error) {
      toast.error('Unable to update your password. The link may have expired.')
      return
    }
    toast.success('Password updated. Please sign in.')
    navigate('/login')
  }

  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password you don't use elsewhere.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input id="password" type="password" className="input" {...register('password')} />
          {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input id="confirm" type="password" className="input" {...register('confirm')} />
          {errors.confirm && <p className="mt-1 text-xs text-danger">{errors.confirm.message}</p>}
        </div>
        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  )
}
