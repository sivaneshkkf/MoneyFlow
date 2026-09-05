import { Landmark, Wallet, CreditCard, ArrowDownLeft, Scale } from 'lucide-react'
import { Skeleton, InfoDot } from '../../components/common'
import { formatCurrency } from '../../utils/format'

function Stat({ icon: Icon, label, value, tone, info }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
          tone === 'danger' ? 'bg-danger/20 text-[#F6A9A9]' : 'bg-white/10 text-white/80'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="flex items-center gap-1 text-xs text-white/55">
          {label}
          {info && <InfoDot text={info} />}
        </p>
        <p className={`text-base font-semibold ${tone === 'danger' ? 'text-[#F6A9A9]' : 'text-white'}`}>{value}</p>
      </div>
    </div>
  )
}

export default function AccountsHero({ metrics, summary, loading }) {
  const ready = !loading && metrics

  return (
    <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark via-[#1D3A35] to-brand-700 p-5 text-white sm:p-6">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <pattern id="hero-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" fill="none" stroke="#ffffff" strokeOpacity="0.05" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#hero-grid)" />
      </svg>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(124,155,149,0.25), transparent 70%)' }}
      />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-1 text-sm text-white/60">
            Available balance
            <InfoDot text="Money currently available across your active bank, cash and wallet accounts. Credit card debt and lending receivables are excluded." />
          </p>
          {!ready ? (
            <Skeleton className="mt-1.5 h-10 w-52 bg-white/10" />
          ) : (
            <>
              <span className="mt-1 block text-3xl font-extrabold tracking-tight sm:text-4xl">
                {formatCurrency(metrics.availableBalance)}
              </span>
              <p className="mt-1.5 text-xs text-white/55">Net worth {formatCurrency(metrics.netWorth)}</p>
            </>
          )}
        </div>

        {ready && (
          <div className="grid grid-cols-2 gap-4 border-white/10 sm:grid-cols-4 sm:divide-x sm:divide-white/10 lg:border-l lg:pl-6">
            <div className="sm:pr-4">
              <Stat icon={Landmark} label="Bank & cards" value={formatCurrency(summary.bank + summary.cards)} />
            </div>
            <div className="sm:px-4">
              <Stat icon={Wallet} label="Wallets & cash" value={formatCurrency(summary.walletsCash + summary.other)} />
            </div>
            <div className="sm:px-4">
              <Stat
                icon={ArrowDownLeft}
                label="Receivable"
                value={formatCurrency(metrics.receivable)}
                info="Money you've lent that has not yet been repaid."
              />
            </div>
            <div className="sm:pl-4">
              <Stat
                icon={CreditCard}
                tone="danger"
                label="Card debt"
                value={formatCurrency(metrics.creditCardDebt)}
                info="Outstanding amount currently owed on active credit cards."
              />
            </div>
          </div>
        )}
      </div>

      {ready && metrics.creditLimit > 0 && (
        <p className="relative mt-4 flex items-center gap-1.5 text-xs text-white/55">
          <Scale className="h-3.5 w-3.5" />
          Credit: {formatCurrency(metrics.availableCredit)} available of {formatCurrency(metrics.creditLimit)} ·{' '}
          {metrics.creditUtilization}% utilised
        </p>
      )}
    </section>
  )
}
