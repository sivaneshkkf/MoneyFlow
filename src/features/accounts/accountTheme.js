// Account visual + data model helpers. One place for type keys, card themes,
// masking and balance bucketing — no styling logic duplicated in components.

export const ACCOUNT_TYPE_KEY = {
  'Bank Account': 'bank',
  Cash: 'cash',
  'UPI Wallet': 'upi',
  'Credit Card': 'credit_card',
  'Debit Card': 'debit_card',
  'Digital Wallet': 'digital_wallet',
  Other: 'other',
}

export const typeKey = (type) => ACCOUNT_TYPE_KEY[type] ?? 'other'

export const CARD_TYPES = new Set(['credit_card', 'debit_card'])
export const isCard = (account) => CARD_TYPES.has(typeKey(account?.type))
export const isCredit = (account) => typeKey(account?.type) === 'credit_card'

// Financial classification — mirrors public.account_financial_type() in SQL.
// Keep the two in sync.
const FINANCIAL_TYPE = {
  cash: 'cash_asset',
  bank: 'bank_asset',
  upi: 'wallet_asset',
  digital_wallet: 'wallet_asset',
  debit_card: 'cash_asset',
  credit_card: 'liability',
  other: 'other_asset',
}
export const getAccountFinancialType = (account) => FINANCIAL_TYPE[typeKey(account?.type)] ?? 'other_asset'
export const isAvailableCashAccount = (account) => getAccountFinancialType(account) !== 'liability'

// --- Card palettes (original, brand-aligned) --------------------------------
// Solid 3-stop gradients (no translucent stops) for crisp, high-contrast cards.
export const CREDIT_PALETTES = {
  emerald: { from: '#08251C', mid: '#123F32', to: '#2F6F63', ink: '#F2FBF8', label: 'Emerald' },
  navy: { from: '#081326', mid: '#12294C', to: '#2E5FA8', ink: '#EEF4FF', label: 'Deep navy' },
  purple: { from: '#1B0B29', mid: '#3B1670', to: '#7C3AED', ink: '#F6F0FF', label: 'Violet' },
  gold: { from: '#2A1E06', mid: '#6B4E14', to: '#C9A227', ink: '#FFFBEE', label: 'Gold' },
  burgundy: { from: '#280913', mid: '#5E162B', to: '#A8324F', ink: '#FFF0F4', label: 'Burgundy' },
  charcoal: { from: '#0E1214', mid: '#20292D', to: '#46555B', ink: '#F4F7F8', label: 'Charcoal' },
}

export const DEBIT_PALETTES = {
  charcoal: { from: '#0B0F11', mid: '#1B262A', to: '#3A4B52', ink: '#F3F7F8', label: 'Charcoal' },
  midnight: { from: '#070C18', mid: '#161F3A', to: '#2A3D6B', ink: '#EEF2FE', label: 'Midnight' },
  forest: { from: '#07211A', mid: '#123B30', to: '#2C6155', ink: '#F1FAF7', label: 'Metallic green' },
  slate: { from: '#111417', mid: '#242B31', to: '#454F57', ink: '#F4F6F8', label: 'Slate' },
}

const CREDIT_ORDER = ['emerald', 'navy', 'purple', 'gold', 'burgundy', 'charcoal']
const DEBIT_ORDER = ['charcoal', 'midnight', 'forest', 'slate']

function hashString(s = '') {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i)
  return Math.abs(h)
}

/** Deterministic palette pick — respects an explicit metadata.theme override. */
export function cardPalette(account) {
  const key = typeKey(account?.type)
  const override = account?.metadata?.theme
  if (key === 'credit_card') {
    return CREDIT_PALETTES[override] ?? CREDIT_PALETTES[CREDIT_ORDER[hashString(account?.id) % CREDIT_ORDER.length]]
  }
  return DEBIT_PALETTES[override] ?? DEBIT_PALETTES[DEBIT_ORDER[hashString(account?.id) % DEBIT_ORDER.length]]
}

export function cardGradient(p) {
  return `linear-gradient(135deg, ${p.from} 0%, ${p.mid} 52%, ${p.to} 100%)`
}

// --- Non-card surface themes -----------------------------------------------
export const SURFACE_THEME = {
  bank: {
    gradient: 'linear-gradient(135deg, #1D3A35 0%, #24534A 60%, #315C54 100%)',
    ink: '#EAF4F1',
    sub: 'rgba(234,244,241,0.72)',
    pattern: 'architecture',
  },
  cash: {
    gradient: 'linear-gradient(135deg, #3B2A18 0%, #6B4C2A 55%, #8A6A3E 100%)',
    ink: '#F7EFE2',
    sub: 'rgba(247,239,226,0.72)',
    pattern: 'wallet',
  },
  upi: {
    gradient: 'linear-gradient(135deg, #3A1D6E 0%, #5B2BB0 55%, #7C4DD8 100%)',
    ink: '#F3EDFC',
    sub: 'rgba(243,237,252,0.74)',
    pattern: 'blobs',
  },
  digital_wallet: {
    gradient: 'linear-gradient(135deg, #0B2A4A 0%, #14548A 55%, #2E86C1 100%)',
    ink: '#E9F3FB',
    sub: 'rgba(233,243,251,0.74)',
    pattern: 'dots',
  },
  other: {
    gradient: 'linear-gradient(135deg, #1B2422 0%, #2C3A37 60%, #43524E 100%)',
    ink: '#EEF2F1',
    sub: 'rgba(238,242,241,0.7)',
    pattern: 'grid',
  },
}

export const surfaceTheme = (account) => SURFACE_THEME[typeKey(account?.type)] ?? SURFACE_THEME.other

// --- Data helpers ---------------------------------------------------------
export function maskedNumber(account, groups = false) {
  const last4 = account?.last_four_digits
  if (!last4) return null
  return groups ? `•••• •••• •••• ${last4}` : `•••• ${last4}`
}

export function expiryLabel(account) {
  const m = account?.metadata?.expiry_month
  const y = account?.metadata?.expiry_year
  if (!m || !y) return null
  return `${String(m).padStart(2, '0')}/${String(y).slice(-2)}`
}

export function creditFigures(account) {
  const limit = Number(account?.metadata?.credit_limit) || 0
  const outstanding = Number(account?.metadata?.current_outstanding) || 0
  return { limit, outstanding, available: Math.max(0, limit - outstanding) }
}

/**
 * Display-only breakdown of active accounts by financial class. The headline
 * figures (availableBalance, netWorth, creditCardDebt, receivable) come from the
 * shared get_financial_summary RPC — this only splits the buckets for the UI.
 */
export function summarize(accounts = []) {
  const active = accounts.filter((a) => a.is_active)
  let bank = 0
  let cards = 0
  let walletsCash = 0
  let other = 0
  let creditOutstanding = 0
  let creditAvailable = 0
  let creditLimit = 0

  for (const a of active) {
    const fin = getAccountFinancialType(a)
    const bal = Number(a.current_balance) || 0
    if (fin === 'bank_asset') bank += bal
    else if (fin === 'cash_asset') cards += bal
    else if (fin === 'wallet_asset') walletsCash += bal
    else if (fin === 'liability') {
      const { outstanding, available, limit } = creditFigures(a)
      creditOutstanding += outstanding
      creditAvailable += available
      creditLimit += limit
    } else other += bal
  }

  return {
    availableBalance: bank + cards + walletsCash + other,
    bank,
    cards, // cash-asset accounts (cash + debit card)
    walletsCash,
    other,
    creditOutstanding,
    creditAvailable,
    creditLimit,
    hasCredit: active.some((a) => getAccountFinancialType(a) === 'liability'),
    count: active.length,
  }
}

const SHORT_TYPE = {
  bank: 'Bank',
  cash: 'Cash',
  upi: 'Wallet',
  digital_wallet: 'Wallet',
  credit_card: 'Credit',
  debit_card: 'Debit',
  other: 'Account',
}

/** Compact label for account <option>s: "SBI · Debit Card ••4858". */
export function accountOptionLabel(a) {
  if (!a) return ''
  const base = `${a.institution || a.name} · ${SHORT_TYPE[typeKey(a.type)] ?? 'Account'}`
  return a.last_four_digits ? `${base} ••${a.last_four_digits}` : base
}

export const NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex', 'Other']
export const BANK_SUBTYPES = ['Savings', 'Current', 'Salary', 'Other']
