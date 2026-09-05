export default function Logo({ className = 'h-8 w-8', withText = false }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg className={className} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect width="40" height="40" rx="12" fill="url(#mf)" />
        <path
          d="M11 27V14.5c0-.8.98-1.2 1.54-.62L20 21.5l7.46-7.62c.56-.58 1.54-.18 1.54.62V27"
          stroke="#DCEAE6"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="mf" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#172321" />
            <stop offset="1" stopColor="#315C54" />
          </linearGradient>
        </defs>
      </svg>
      {withText && <span className="text-lg font-extrabold tracking-tight">MoneyFlow</span>}
    </span>
  )
}
