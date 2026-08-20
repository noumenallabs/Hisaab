import { formatMinor } from "@/lib/currency"

export function CurrencyAmount({
  minor,
  currency = "INR",
  tone = "ink",
  className = "",
}: {
  minor: number
  currency?: string
  tone?: "ink" | "owed" | "owe" | "faint"
  className?: string
}) {
  const colors: Record<string, string> = {
    ink: "text-ink",
    owed: "text-owed",
    owe: "text-owe",
    faint: "text-ink-faint",
  }
  return (
    <span className={`tnum font-mono ${colors[tone]} ${className}`}>
      {formatMinor(minor, currency)}
    </span>
  )
}
