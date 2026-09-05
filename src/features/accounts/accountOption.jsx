import { Landmark, Banknote, Wallet, CreditCard, Ban, Boxes } from 'lucide-react'
import { typeKey } from './accountTheme'

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
