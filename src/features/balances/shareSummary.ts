import { formatMinor } from "@/lib/currency"

export type ShareTransferItem = {
  fromName: string
  toName: string
  amountMinor: number
}

export type TripShareOptions = {
  tripName: string
  currency: string
  totalMinor: number
  expenseCount: number
  transfers: ShareTransferItem[]
  tripUrl: string
}

export function generateTripShareText(opts: TripShareOptions): string {
  const { tripName, currency, totalMinor, expenseCount, transfers, tripUrl } = opts
  const formattedTotal = formatMinor(totalMinor, currency)

  let text = `✈️ *${tripName}* — Settlement Summary\n`
  text += `📊 Total Spent: ${formattedTotal} (${expenseCount} ${expenseCount === 1 ? "expense" : "expenses"})\n\n`

  if (transfers.length === 0) {
    text += `🎉 All balances are settled up! No transfers needed.\n\n`
  } else {
    text += `💰 *Settlement Plan (Minimum Transfers):*\n`
    for (const t of transfers) {
      const amt = formatMinor(t.amountMinor, currency)
      text += `👉 *${t.fromName}* pays *${t.toName}*: ${amt}\n`
    }
    text += `\n`
  }

  text += `🔗 View full ledger on Hissaab: ${tripUrl}`
  return text
}

export async function shareTripSummary(opts: TripShareOptions): Promise<"shared" | "copied"> {
  const text = generateTripShareText(opts)
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title: `${opts.tripName} — Settlement Summary`,
        text: text,
      })
      return "shared"
    } catch (err: any) {
      // User cancelled share sheet or share failed -> fallback to clipboard
      if (err.name === "AbortError") return "shared"
    }
  }

  // Fallback: clipboard
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return "copied"
  } else {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    document.execCommand("copy")
    ta.remove()
    return "copied"
  }
}
