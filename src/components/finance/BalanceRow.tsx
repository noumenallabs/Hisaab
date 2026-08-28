import { CurrencyAmount } from "./CurrencyAmount"
import { formatMinor } from "@/lib/currency"
import { UserAvatar } from "@/components/feedback/UserAvatar"

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
    <div className="flex items-center justify-between rounded-xl border border-hair bg-surface p-4 shadow-2xs">
      <div className="flex items-center gap-3">
        <UserAvatar id={userId} name={name} size="md" />
        <div>
          <p className="text-sm font-bold text-ink">{name}</p>
          <p className="text-xs text-ink-soft tnum">
            paid {formatMinor(paid, currency)} · share {formatMinor(owed, currency)}
          </p>
        </div>
      </div>
      <CurrencyAmount minor={net} currency={currency} tone={tone} className="font-bold tnum text-sm font-mono" />
    </div>
  )
}
