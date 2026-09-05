import { typeKey } from './accountTheme'
import PaymentCard from './cards/PaymentCard'
import BankAccountCard from './cards/BankAccountCard'
import CashAccountCard from './cards/CashAccountCard'
import WalletCard from './cards/WalletCard'
import OtherAccountCard from './cards/OtherAccountCard'

export default function AccountCard({ account, cardholderName, menuProps }) {
  const key = typeKey(account.type)
  const inner = (() => {
    switch (key) {
      case 'credit_card':
      case 'debit_card':
        return <PaymentCard account={account} cardholderName={cardholderName} menuProps={menuProps} />
      case 'bank':
        return <BankAccountCard account={account} menuProps={menuProps} />
      case 'cash':
        return <CashAccountCard account={account} menuProps={menuProps} />
      case 'upi':
      case 'digital_wallet':
        return <WalletCard account={account} menuProps={menuProps} />
      default:
        return <OtherAccountCard account={account} menuProps={menuProps} />
    }
  })()

  return <div className={account.is_active ? '' : 'opacity-60 grayscale-[0.35]'}>{inner}</div>
}
