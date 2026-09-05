import { Banknote } from 'lucide-react'
import SurfaceCard from './SurfaceCard'
import { formatCurrency } from '../../../utils/format'

export default function CashAccountCard({ account, menuProps }) {
  return (
    <SurfaceCard
      account={account}
      icon={Banknote}
      eyebrow="Cash on hand"
      primaryLabel="Available balance"
      primaryValue={formatCurrency(account.current_balance)}
      footer={<span>Physical cash · updated manually</span>}
      menuProps={menuProps}
    />
  )
}
