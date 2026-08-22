import { formatMinor } from "@/lib/currency"

export function formatActivitySummary(
  a: any,
  actorName: string,
  memberMap: Map<string, string>,
  expensesMap: Map<string, any>,
  baseCurrency = "INR"
): string {
  if (a.action === "settle" || a.entity_type === "settlement") {
    const fromId = a.new_values?.from_user_id ?? a.diff?.from_user_id ?? a.from_user_id
    const toId = a.new_values?.to_user_id ?? a.diff?.to_user_id ?? a.to_user_id
    const fromName = fromId ? memberMap.get(fromId) ?? fromId.slice(0, 8) : null
    const toName = toId ? memberMap.get(toId) ?? toId.slice(0, 8) : null
    const amountMinor = Number(a.new_values?.amount_minor ?? a.diff?.amount_minor ?? a.amount_minor ?? 0)
    const formattedAmount = amountMinor > 0 ? formatMinor(amountMinor, baseCurrency) : ""

    if (fromName && toName) {
      return `${fromName} paid ${formattedAmount} to ${toName} (settlement recorded by ${actorName})`
    }
    return `${actorName} recorded a settlement`
  }
  if (a.action === "archive") return `${actorName} archived the trip`
  if (a.action === "join") return `${actorName} joined the trip`
  if (a.action === "role_change") return `${actorName} changed member role`
  if (a.action === "remove") return `${actorName} removed a member`

  if (a.entity_type === "expense") {
    const exp = expensesMap.get(a.entity_id)
    const desc = a.new_values?.description ?? exp?.description ?? "Expense"
    const amountMinor = Number(
      a.new_values?.amount_minor ?? exp?.amount_minor ?? exp?.amount ?? 0
    )
    const currency = a.new_values?.currency ?? exp?.currency ?? baseCurrency
    const formattedAmount = formatMinor(amountMinor, currency)

    // Payers
    const payers = (
      exp?.expense_payers ??
      exp?.payers ??
      a.new_values?.expense_payers ??
      a.new_values?.payers ??
      a.diff?.expense_payers ??
      a.diff?.payers ??
      []
    ) as any[]
    const payerNames = payers
      .map((p: any) => memberMap.get(p.user_id ?? p.userId))
      .filter(Boolean) as string[]

    if (a.action === "create") {
      if (payerNames.length === 1) {
        const payerName = payerNames[0]
        if (payerName.toLowerCase() === actorName.toLowerCase()) {
          return `${actorName} paid ${formattedAmount} for "${desc}"`
        } else {
          return `${payerName} paid ${formattedAmount} for "${desc}" (recorded by ${actorName})`
        }
      }
      if (payerNames.length > 1) {
        return `${actorName} recorded "${desc}" (${formattedAmount} split paid by ${payerNames.join(", ")})`
      }
      return `${actorName} paid ${formattedAmount} for "${desc}"`
    }

    if (a.action === "update") return `${actorName} updated "${desc}"`
    if (a.action === "soft_delete") return `${actorName} deleted "${desc}"`
    if (a.action === "restore") return `${actorName} restored "${desc}"`
  }

  const map: Record<string, string> = {
    create: "created",
    update: "updated",
    soft_delete: "deleted",
    restore: "restored",
  }
  const act = map[a.action] ?? a.action
  const entity =
    a.entity_type === "member"
      ? "member"
      : a.entity_type === "trip"
      ? "trip"
      : a.entity_type
  return `${actorName} ${act} ${entity}`
}
