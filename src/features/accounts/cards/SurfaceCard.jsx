import AccountMenu from '../AccountMenu'
import { CardPattern } from '../CardArt'
import { surfaceTheme } from '../accountTheme'

/** Shared base for non-payment account tiles (bank, cash, upi, wallet, other). */
export default function SurfaceCard({ account, icon: Icon, eyebrow, badges, primaryLabel, primaryValue, footer, menuProps, light = false }) {
  const theme = surfaceTheme(account)
  const ink = light ? '#18201E' : theme.ink
  const sub = light ? '#6B7672' : theme.sub

  return (
    <div
      className="group relative flex aspect-[1.586/1] min-h-[190px] flex-col justify-between gap-1.5 overflow-hidden rounded-[18px] p-4 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.5)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.55)] sm:p-5"
      style={
        light
          ? { background: '#FFFFFF', border: '1px solid #E4E9E7', color: ink }
          : { background: theme.gradient, color: ink }
      }
    >
      {!light && <CardPattern variant={theme.pattern} ink={theme.ink} />}
      {light && <div className="pointer-events-none absolute inset-0 opacity-[0.5]"><CardPattern variant={theme.pattern} ink="#315C54" /></div>}

      <div className="relative flex items-start justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: light ? '#DCEAE6' : 'rgba(255,255,255,0.14)', color: light ? '#2F6F63' : ink }}
          >
            <Icon style={{ width: 18, height: 18 }} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{account.name}</p>
            {eyebrow && (
              <p className="truncate text-[11px] uppercase tracking-wider" style={{ color: sub }}>
                {eyebrow}
              </p>
            )}
          </div>
        </div>
        <AccountMenu account={account} tone={light ? 'light' : 'dark'} {...menuProps} />
      </div>

      {badges && <div className="relative flex flex-wrap gap-1.5">{badges}</div>}

      <div className="relative">
        <p className="text-[11px] uppercase tracking-wider" style={{ color: sub }}>
          {primaryLabel}
        </p>
        <p className="mt-0.5 text-2xl font-bold tracking-tight">{primaryValue}</p>
      </div>

      {footer && (
        <div className="relative text-[12px]" style={{ color: sub }}>
          {footer}
        </div>
      )}
    </div>
  )
}
