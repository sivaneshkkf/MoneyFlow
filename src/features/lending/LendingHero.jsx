import { Wallet, ArrowDownLeft, Coins, AlertTriangle, TrendingUp } from 'lucide-react'
import { Skeleton, InfoDot } from '../../components/common'
import { formatCurrency } from '../../utils/format'

function Stat({ icon: Icon, label, value, tone, info }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
          tone === 'danger' ? 'bg-danger/20 text-[#F6A9A9]' : tone === 'success' ? 'bg-success/20 text-[#7CE7A6]' : 'bg-white/10 text-white/80'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="flex items-center gap-1 text-xs text-white/55">
          {label}
          {info && <InfoDot text={info} />}
        </p>
        <p
          className={`text-base font-semibold ${
            tone === 'danger' ? 'text-[#F6A9A9]' : tone === 'success' ? 'text-[#7CE7A6]' : 'text-white'
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  )
}

export default function LendingHero({ summary, loading, overdueLoans = 0 }) {
  const ready = !loading && summary

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark via-[#1D3A35] to-brand-700 p-5 text-white sm:p-6">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <pattern id="lending-hero-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#lending-hero-grid)" />
      </svg>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(124,155,149,0.25), transparent 70%)' }}
      />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-1 text-sm text-white/60">
            Total lent
            <InfoDot text="Lifetime principal you've lent out, excluding cancelled and written-off loans." />
          </p>
          {!ready ? (
            <Skeleton className="mt-1.5 h-10 w-52 bg-white/10" />
          ) : (
            <>
              <span className="mt-1 block text-3xl font-extrabold tracking-tight sm:text-4xl">
                {formatCurrency(summary.totalLent)}
              </span>
              <p className="mt-1.5 text-xs text-white/55">
                {formatCurrency(summary.received)} recovered · {summary.recoveryPct.toFixed(0)}% recovery rate
              </p>
            </>
          )}
        </div>

        {ready && (
          <div className="grid grid-cols-2 gap-4 border-white/10 sm:grid-cols-4 sm:divide-x sm:divide-white/10 lg:border-l lg:pl-6">
            <div className="sm:pr-4">
              <Stat
                icon={ArrowDownLeft}
                label="Outstanding"
                value={formatCurrency(summary.outstanding)}
                info="Principal + interest still to be repaid."
              />
            </div>
            <div className="sm:px-4">
              <Stat icon={Wallet} label="Received" value={formatCurrency(summary.received)} />
            </div>
            <div className="sm:px-4">
              <Stat
                icon={Coins}
                tone="success"
                label="Interest earned"
                value={formatCurrency(summary.interestEarned)}
              />
            </div>
            <div className="sm:pl-4">
              <Stat
                icon={AlertTriangle}
                tone={summary.overdue > 0 ? 'danger' : 'default'}
                label="Overdue"
                value={formatCurrency(summary.overdue)}
              />
            </div>
          </div>
        )}
      </div>

      {ready && (
        <p className="relative mt-4 flex items-center gap-1.5 text-xs text-white/55">
          <TrendingUp className="h-3.5 w-3.5" />
          {summary.borrowerCount} borrower{summary.borrowerCount === 1 ? '' : 's'}
          {overdueLoans > 0 && ` · ${overdueLoans} loan${overdueLoans === 1 ? '' : 's'} overdue`}
        </p>
      )}
    </section>
  )
}
