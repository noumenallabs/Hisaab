import { CurrencyAmount } from "./CurrencyAmount"
import { formatMinor } from "@/lib/currency"
import { UserAvatar } from "@/components/feedback/UserAvatar"
import { ChevronRight } from "lucide-react"

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
    <div className="flex items-center justify-between rounded-xl border border-hair bg-surface p-4 shadow-2xs transition-colors hover:bg-canvas/40">
      <div className="flex items-center gap-3 min-w-0">
        <UserAvatar id={userId} name={name} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink truncate">{name}</p>
          <p className="text-xs text-ink-soft tnum font-mono">
            paid {formatMinor(paid, currency)} · share {formatMinor(owed, currency)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        <CurrencyAmount minor={net} currency={currency} tone={tone} className="font-bold tnum text-sm font-mono" />
        <ChevronRight size={15} className="text-ink-faint shrink-0" />
      </div>
    </div>
  )
}

