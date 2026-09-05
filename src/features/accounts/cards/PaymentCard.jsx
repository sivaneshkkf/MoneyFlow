import AccountMenu from '../AccountMenu'
import { Chip, Contactless, NetworkMark, CardPattern, Sheen } from '../CardArt'
import { cardPalette, cardGradient, expiryLabel, creditFigures, isCredit } from '../accountTheme'
import { formatCurrency } from '../../../utils/format'

function Dots() {
  return (
    <span className="flex items-center gap-[5px]" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="h-[7px] w-[7px] rounded-full bg-current opacity-90" />
      ))}
    </span>
  )
}

export default function PaymentCard({ account, cardholderName, menuProps }) {
  const credit = isCredit(account)
  const palette = cardPalette(account)
  const ink = palette.ink
  const last4 = account.last_four_digits || '••••'
  const expiry = expiryLabel(account)
  const { outstanding, available, limit } = creditFigures(account)
  const utilisation = limit > 0 ? Math.round((outstanding / limit) * 100) : null

  return (
    <div
      className="group relative flex aspect-[1.586/1] min-h-[190px] flex-col justify-between gap-1.5 overflow-hidden rounded-[18px] p-4 text-white shadow-[0_12px_30px_-14px_rgba(0,0,0,0.5)] transition-transform duration-200 will-change-transform hover:-translate-y-1 hover:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)] sm:p-5"
      style={{ background: cardGradient(palette), color: ink }}
    >
      <CardPattern variant={credit ? 'waves' : 'flow'} ink={ink} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(160deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 42%)' }}
      />
      <Sheen />

      {/* header */}
      <div className="relative flex items-start justify-between">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-tight">{account.institution || 'Bank'}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">
            {credit ? 'Credit Card' : 'Debit Card'}
          </p>
        </div>
        <div className="-mr-1 -mt-1 shrink-0">
          <AccountMenu account={account} tone="dark" {...menuProps} />
        </div>
      </div>

      {/* chip + contactless */}
      <div className="relative flex items-center gap-3">
        <Chip />
        <Contactless color={ink} className="opacity-75" />
      </div>

      {/* number */}
      <div className="relative flex items-center gap-3 font-mono text-lg font-medium tracking-wider">
        <Dots />
        <Dots />
        <Dots />
        <span className="tracking-[0.18em]">{last4}</span>
      </div>

      {/* footer */}
      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold uppercase tracking-[0.08em]">
            {cardholderName || account.name}
          </p>
          {credit ? (
            <>
              <p className="mt-0.5 truncate text-[10.5px] opacity-70">
                Outstanding {formatCurrency(outstanding)}
              </p>
              {limit > 0 && (
                <p className="truncate text-[10.5px] opacity-70">
                  {formatCurrency(available)} left · {utilisation}% used
                </p>
              )}
            </>
          ) : (
            <p className="mt-0.5 truncate text-[10.5px] opacity-70">
              Balance {formatCurrency(account.current_balance)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 pb-0.5 text-right">
          {expiry && <span className="text-[10px] opacity-70">VALID {expiry}</span>}
          <NetworkMark network={account.metadata?.network} ink={ink} />
        </div>
      </div>
    </div>
  )
}
