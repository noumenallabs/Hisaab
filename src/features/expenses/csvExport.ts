import { fromMinor, decimalsFor } from "@/lib/currency"

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return '""'
  const str = String(val).replace(/"/g, '""')
  return `"${str}"`
}

export function generateExpensesCsv(
  expenses: any[],
  memberMap: Map<string, string>,
  baseCurrency = "INR"
): string {
  const activeExpenses = (expenses ?? []).filter((e) => !e.deleted_at && !e.deleted)
  const headers = [
    "Date",
    "Description",
    "Category",
    "Amount",
    "Currency",
    "Paid By",
    "Split Between",
    "Receipt Attached",
    "Notes",
  ]

  const rows: string[] = [headers.join(",")]

  for (const exp of activeExpenses) {
    const date = exp.expense_date ?? exp.date ?? ""
    const desc = exp.description ?? "Expense"
    const cat = (exp.category ?? "other").replace(/^./, (s: string) => s.toUpperCase())
    const cur = exp.currency ?? baseCurrency
    const dec = decimalsFor(cur)
    const amountMinor = Number(exp.amount_minor ?? exp.amount ?? 0)
    const formattedAmount = (fromMinor(amountMinor, dec)).toFixed(dec)

    // Payers
    const payers = (exp.expense_payers ?? exp.payers ?? []) as any[]
    const payerNames = payers
      .map((p) => memberMap.get(p.user_id ?? p.userId) ?? "Member")
      .join("; ")

    // Splits
    const splits = (exp.expense_splits ?? exp.splits ?? []) as any[]
    const splitNames = splits
      .map((s) => memberMap.get(s.user_id ?? s.userId) ?? "Member")
      .join("; ")

    const hasReceipt = exp.receipt_path ? "Yes" : "No"
    const notes = exp.notes ?? ""

    const row = [
      escapeCsv(date),
      escapeCsv(desc),
      escapeCsv(cat),
      escapeCsv(formattedAmount),
      escapeCsv(cur),
      escapeCsv(payerNames),
      escapeCsv(splitNames),
      escapeCsv(hasReceipt),
      escapeCsv(notes),
    ]

    rows.push(row.join(","))
  }

  return rows.join("\n")
}

export function downloadExpensesCsv(
  expenses: any[],
  memberMap: Map<string, string>,
  tripName: string,
  baseCurrency = "INR"
) {
  const csv = generateExpensesCsv(expenses, memberMap, baseCurrency)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const filename = `${tripName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-expenses.csv`

  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
