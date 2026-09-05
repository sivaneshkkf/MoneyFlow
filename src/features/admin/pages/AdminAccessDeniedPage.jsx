import { Link } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

export default function AdminAccessDeniedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-danger/10 text-danger">
        <ShieldAlert className="h-7 w-7" />
      </span>
      <div>
        <h1 className="text-xl font-bold">Access Restricted</h1>
        <p className="mt-1.5 max-w-sm text-sm text-ink-soft">
          You don&apos;t have permission to access the MoneyFlow Admin Console.
        </p>
      </div>
      <Link to="/dashboard" className="btn-primary">
        Back to MoneyFlow
      </Link>
    </div>
  )
}
