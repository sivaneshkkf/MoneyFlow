import { differenceInCalendarDays } from 'date-fns'

export const GOAL_CATEGORY_COLOR = {
  'Emergency Fund': '#EF4444',
  'New Laptop': '#3B82F6',
  Bike: '#F59E0B',
  Car: '#8B5CF6',
  Vacation: '#0EA5E9',
  Education: '#22C55E',
  House: '#315C54',
  Other: '#8B5CF6',
}
export const goalColor = (cat) => GOAL_CATEGORY_COLOR[cat] ?? '#2F6F63'

/** Amount to save per day/week to hit target_date on time. */
export function goalPace(goal) {
  const remaining = Math.max(0, Number(goal.target_amount) - Number(goal.current_amount))
  if (remaining <= 0 || !goal.target_date) return null
  const days = differenceInCalendarDays(new Date(goal.target_date), new Date())
  if (days <= 0) return { overdue: true, remaining }
  return {
    overdue: false,
    remaining,
    perDay: Math.ceil(remaining / days),
    perWeek: Math.ceil(remaining / (days / 7)),
    days,
  }
}

/** Friendly piggy-bank illustration (pure SVG). */
export function PiggyIllustration({ className = 'h-32 w-40' }) {
  return (
    <svg viewBox="0 0 200 150" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="100" cy="126" rx="70" ry="10" fill="#2F6F63" fillOpacity="0.08" />
      <path d="M40 90c-6 0-10-4-10-9s3-8 7-9" stroke="#B9C6C2" strokeWidth="6" strokeLinecap="round" />
      <path
        d="M60 60c22-14 58-14 80 0 8 5 14 13 16 23 2 2 6 3 8 7 1 3 0 7-3 8-1 6-4 11-8 15v10c0 3-3 6-6 6h-8c-3 0-6-3-6-6v-3c-11 3-24 3-35 0v3c0 3-3 6-6 6h-8c-3 0-6-3-6-6v-9c-9-8-14-19-14-31 0-14 6-27 16-34z"
        fill="#C7D2CD"
      />
      <path d="M55 55c-6-4-4-14 3-15 5-1 10 3 11 9" fill="#C7D2CD" />
      <circle cx="132" cy="80" r="4" fill="#3A4A46" />
      <path d="M150 78c4 1 8 4 9 8" stroke="#3A4A46" strokeWidth="3" strokeLinecap="round" />
      <rect x="92" y="52" width="18" height="4" rx="2" fill="#8FA39D" />
      <path d="M60 108c0 3 3 6 6 6h8c3 0 6-3 6-6" fill="#B4C1BC" />
      <path d="M118 108c0 3 3 6 6 6h8c3 0 6-3 6-6" fill="#B4C1BC" />
      {/* coin */}
      <circle cx="101" cy="34" r="12" fill="#22C55E" />
      <text x="101" y="39" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="700">
        ₹
      </text>
      {/* sparkles */}
      <path d="M155 40l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#22C55E" fillOpacity="0.5" />
      <path d="M45 44l1.5 3.5L50 49l-3.5 1.5L45 54l-1.5-3.5L40 49l3.5-1.5z" fill="#22C55E" fillOpacity="0.4" />
    </svg>
  )
}
