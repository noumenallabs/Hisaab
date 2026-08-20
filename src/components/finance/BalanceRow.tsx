import { CurrencyAmount } from "./CurrencyAmount"
import { formatMinor } from "@/lib/currency"
import { Avatar } from "@/components/members/Avatar"

export function BalanceRow({
  userId,
  name,
  paid,
  owed,
  net,
  currency = "INR",
}: {
  userId: string
  name: string
  paid: number
  owed: number
  net: number
  currency?: string
}) {
  const tone = net > 0 ? "owed" : net < 0 ? "owe" : "ink"
  return (
    <div className="flex items-center justify-between rounded-xl border border-hair bg-surface p-4">
      <div className="flex items-center gap-3">
        <Avatar id={userId} />
        <div>
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-xs text-ink-soft">
            paid {formatMinor(paid, currency)} · share {formatMinor(owed, currency)}
          </p>
        </div>
      </div>
      <CurrencyAmount minor={net} currency={currency} tone={tone} className="font-bold" />
    </div>
  )
}
