export function friendlyError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback
  const msg = typeof error === 'string' ? error : error.message || ''

  // Network-level failures (offline, blocked request, DNS, CORS) — the
  // browser throws these instead of the API ever responding.
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
    return 'Network error. Check your connection and try again.'
  }

  // Supabase Auth — surface the real reason instead of one generic message.
  if (/invalid login credentials/i.test(msg)) {
    return 'Incorrect email or password.'
  }
  if (/email not confirmed/i.test(msg)) {
    return 'Please verify your email before signing in.'
  }
  if (/user already registered|already been registered/i.test(msg)) {
    return 'An account with this email already exists.'
  }
  if (/rate limit|too many requests|only request this after/i.test(msg)) {
    return 'Too many attempts. Please wait a moment and try again.'
  }
  if (/password should be at least/i.test(msg)) {
    return 'Password is too short.'
  }

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
