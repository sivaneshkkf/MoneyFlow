import { Link } from 'react-router-dom'
import clsx from 'clsx'

// The one official logo asset — icon only. The "MoneyFlow" wordmark is
// real text (not an image), styled to match the brand mark: "Money" in the
// app's ink color, "Flow" in the app's green gradient (success -> brand-700).
const ICON_SRC = '/logo.png'
const ICON_RATIO = 577 / 566 // real PNG dimensions — keeps it from ever stretching

function Wordmark({ textSize, tone, tagline }) {
  const moneyClass = tone === 'light' ? 'text-white' : tone === 'dark' ? 'text-ink' : 'text-ink dark:text-white'
  return (
    <span className="inline-flex flex-col leading-none">
      <span className={clsx('font-extrabold tracking-tight', textSize)}>
        <span className={moneyClass}>Money</span>
        <span className="bg-gradient-to-r from-success to-brand-700 bg-clip-text text-transparent">Flow</span>
      </span>
      {tagline && (
        <span className={clsx('mt-1 text-xs font-medium', tone === 'light' ? 'text-white/55' : 'text-ink-soft')}>
          Your Money. Your Control.
        </span>
      )}
    </span>
  )
}

/**
 * The single source of truth for MoneyFlow's branding everywhere in the
 * app. The icon is always the one official asset (/logo.png, never
 * redrawn); the "MoneyFlow" wordmark next to/under it is real, selectable
 * text in the app's own theme colors — not a second image.
 *
 *   <MoneyFlowLogo />                      icon + "MoneyFlow" text, side by side
 *   <MoneyFlowLogo variant="icon" />       icon only
 *   <MoneyFlowLogo variant="stacked" />    icon above "MoneyFlow" text, centered
 *   <MoneyFlowLogo tagline />              adds "Your Money. Your Control."
 *   <MoneyFlowLogo tone="light" />         forces white wordmark text for a
 *                                          permanently-dark surface (e.g. the
 *                                          auth marketing panel), independent
 *                                          of the light/dark theme toggle
 *
 * `size` sets the icon height (e.g. `h-8`); `textSize` sets the wordmark's
 * font size (e.g. `text-lg`). Pass `to` to wrap it in a router Link.
 */
export default function MoneyFlowLogo({
  variant = 'full',
  size = 'h-8',
  textSize = 'text-lg',
  tone = 'auto',
  tagline = false,
  to,
  alt = 'MoneyFlow',
}) {
  const icon = (
    <img
      src={ICON_SRC}
      alt={variant === 'icon' ? alt : ''}
      aria-hidden={variant !== 'icon' || undefined}
      className={clsx('w-auto shrink-0 object-contain', size)}
      style={{ aspectRatio: ICON_RATIO }}
    />
  )

  const content =
    variant === 'icon' ? (
      icon
    ) : variant === 'stacked' ? (
      <span className="inline-flex flex-col items-center gap-1.5">
        {icon}
        <Wordmark textSize={textSize} tone={tone} tagline={tagline} />
      </span>
    ) : (
      <span className="inline-flex items-center gap-2">
        {icon}
        <Wordmark textSize={textSize} tone={tone} tagline={tagline} />
      </span>
    )

  if (to) {
    return (
      <Link to={to} className="inline-flex shrink-0 items-center" aria-label={alt}>
        {content}
      </Link>
    )
  }
  return content
}
