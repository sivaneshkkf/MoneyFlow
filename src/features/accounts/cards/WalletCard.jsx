import { Wallet, Smartphone } from 'lucide-react'
import SurfaceCard from './SurfaceCard'
import { typeKey } from '../accountTheme'
import { formatCurrency } from '../../../utils/format'

export default function WalletCard({ account, menuProps }) {
  const upi = typeKey(account.type) === 'upi'
  const identifier = account.metadata?.upi_id || account.metadata?.identifier

  return (
    <SurfaceCard
      account={account}
      icon={upi ? Smartphone : Wallet}
      eyebrow={upi ? 'UPI wallet' : 'Digital wallet'}
      primaryLabel="Available balance"
      primaryValue={formatCurrency(account.current_balance)}
      footer={
        <div className="flex flex-wrap items-center gap-x-3">
          {identifier ? <span className="font-mono">{identifier}</span> : <span>{account.institution || 'Wallet'}</span>}
        </div>
      }
      menuProps={menuProps}
    />
  )
}
