export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  const msg = typeof error === 'string' ? error : error.message || ''
  if (msg.startsWith('PLAN_LIMIT:')) {
    return "You've reached your Free plan limit for this. Upgrade to Pro for unlimited access."
  }
  if (/JWT|session|expired|not authenticated/i.test(msg)) {
    return 'Your session has expired. Please sign in again.'
  }
  if (/duplicate key|unique constraint/i.test(msg)) {
    return 'That record already exists.'
  }
  if (/violates row-level security|permission denied/i.test(msg)) {
    return 'You do not have permission to do that.'
  }
  // Surface our own raise exception messages (they are user-friendly by design).
  if (msg && msg.length < 160 && !/relation|column|syntax|function/i.test(msg)) {
    return msg
  }
  return fallback
}
