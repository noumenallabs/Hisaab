import { Link } from "react-router"
import { CurrencyAmount } from "./CurrencyAmount"
import { formatMinor } from "@/lib/currency"
import { categoryMeta } from "@/data"
import type { Category } from "@/data"

export function ExpenseRow({
  expense,
  tripId,
  myContribution,
  currency = "INR",
}: {
  expense: {
    id: string
    description: string
    category: Category
    amount_minor?: number
    amount?: number
    currency?: string
    expense_date?: string
    date?: string
    payers?: any[]
  }
  tripId: string
  myContribution?: number
  currency?: string
}) {
  const expenseCurrency = expense.currency ?? currency
  const amount = expense.amount_minor ?? expense.amount ?? 0
  const date = expense.expense_date ?? expense.date ?? ""
  const c = categoryMeta[expense.category] ?? categoryMeta.other
  return (
    <Link
      to={`/trips/${tripId}/expenses/${expense.id}`}
      className="flex items-center justify-between rounded-xl border border-hair bg-surface p-4 hover:border-ink-faint"
    >
      <div>
        <p className="font-semibold">{expense.description}</p>
        <p className="mt-1 flex items-center gap-2 text-xs text-ink-soft">
          <span
            className="rounded px-1.5 py-0.5 text-[11px] font-medium"
            style={{ color: c.color, background: c.bg }}
          >
            {c.label}
          </span>
          {date}{" "}
          {myContribution !== undefined && (
            <>
              ·{" "}
              <span className="font-mono">
                {myContribution > 0 ? "you paid" : "you owe"}{" "}
                {formatMinor(Math.abs(myContribution), expenseCurrency)}
              </span>
            </>
          )}
        </p>
      </div>
      <CurrencyAmount
        minor={amount}
        currency={expenseCurrency}
        className="text-sm font-bold"
      />
    </Link>
  )
}
