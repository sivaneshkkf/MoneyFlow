import { Landmark, Banknote, Wallet, CreditCard, Ban, Boxes } from 'lucide-react'
import { typeKey, accountTableLabelParts } from './accountTheme'

const TYPE_ICON = {
  bank: Landmark,
  cash: Banknote,
  upi: Wallet,
  digital_wallet: Wallet,
  credit_card: CreditCard,
  debit_card: CreditCard,
  other: Boxes,
}

export function AccountTypeIcon({ account, className = 'h-4 w-4' }) {
  const Icon = account ? TYPE_ICON[typeKey(account.type)] ?? Boxes : Ban
  return <Icon className={className} />
}

/**
 * Compact label for an "Account" column in a table row: "SIVA-AXIS-●●●0789"
 * — first 4 letters of the account name, the bank/institution, and the
 * last 4 digits (masked), dash-separated. Falls back gracefully when a part
 * is missing (e.g. no institution set, or a non-card account with no digits).
 */
export function accountTableLabel(a) {
  const parts = accountTableLabelParts(a)
  if (!parts) return '—'
  const { namePart, institution, last4 } = parts
  return (
    <>
      {namePart}
      {namePart && institution && '-'}
      {institution}
      {last4 && (
        <>
          -<span className="text-black/50">●●●</span>
          {last4}
        </>
      )}
    </>
  )
}

/**
 * Factory for a <Select renderOption> that shows the account label on the left
 * and a type icon on the right. Pass the list of accounts so it can resolve the
 * option value (account id) back to the account.
 */
export function renderAccountOption(accounts = []) {
  const byId = new Map(accounts.map((a) => [a.id, a]))
  return function AccountOption({ value, label }) {
    const account = byId.get(value)
    return (
      <>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <AccountTypeIcon account={account} className="h-4 w-4 shrink-0 opacity-70" />
      </>
    )
  }
}
