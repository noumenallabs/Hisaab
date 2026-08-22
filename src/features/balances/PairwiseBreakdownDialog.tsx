import { createPortal } from "react-dom"
import { formatMinor } from "@/lib/currency"
import { computePairwiseLedger } from "./categoryMath"
import { X, Receipt, ArrowRight, HelpCircle } from "lucide-react"

export function PairwiseBreakdownDialog({
  open,
  onClose,
  expenses,
  fromId,
  toId,
  fromName,
  toName,
  transferAmountMinor,
  baseCurrency,
}: {
  open: boolean
  onClose: () => void
  expenses: any[]
  fromId: string
  toId: string
  fromName: string
  toName: string
  transferAmountMinor: number
  baseCurrency: string
}) {
  if (!open) return null

  const ledger = computePairwiseLedger(expenses, toId, fromId)
  // toId = A (creditor/receiver), fromId = B (debtor/payer)
  // ledger.netPairwiseMinor > 0 means B owes A directly

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pairwise-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg rounded-2xl border border-hair bg-surface p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between border-b border-hair pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="pairwise-title" className="text-lg font-bold tracking-tight">
                Pairwise Expense Ledger
              </h2>
            </div>
            <p className="text-xs text-ink-soft">
              Direct shared expenses between <b className="text-ink">{fromName}</b> and <b className="text-ink">{toName}</b>
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-canvas"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Transfer vs Direct Comparison Card */}
        <div className="rounded-xl border border-hair bg-canvas/40 p-4 text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-semibold text-ink-soft">Simplified Transfer Required:</span>
            <span className="font-mono text-sm font-bold text-brand">
              {formatMinor(transferAmountMinor, baseCurrency)}
            </span>
          </div>
          <div className="flex justify-between items-center text-ink-faint border-t border-hair/50 pt-2">
            <span>Direct Shared Difference:</span>
            <span className="font-mono font-semibold text-ink">
              {formatMinor(Math.abs(ledger.netPairwiseMinor), baseCurrency)}
            </span>
          </div>
          <p className="text-[11px] text-ink-faint leading-4">
            💡 <span className="font-semibold text-ink">Note:</span> Hissaab simplifies group debts so fewer total payments are needed. Even if you didn't share all expenses directly with {toName}, paying them helps clear the entire group's balance.
          </p>
        </div>

        {/* Shared Transactions List */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
            Shared Transactions ({ledger.items.length})
          </h3>
          {ledger.items.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink-soft border border-dashed border-hair rounded-xl">
              No directly shared transactions between these two members. This debt was optimized through group multi-party simplification.
            </p>
          ) : (
            <ul className="divide-y divide-hair rounded-xl border border-hair bg-surface overflow-hidden">
              {ledger.items.map((item) => (
                <li key={item.expenseId} className="p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <Receipt size={14} className="text-brand" />
                      <span className="truncate">{item.description}</span>
                    </div>
                    <span className="font-mono font-bold text-ink">
                      {formatMinor(item.totalMinor, baseCurrency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-ink-soft pl-5">
                    <span>
                      {fromName}'s share: {formatMinor(item.amountOwedByB, baseCurrency)}
                    </span>
                    <span>
                      {toName}'s share: {formatMinor(item.amountOwedByA, baseCurrency)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl bg-brand px-5 text-xs font-bold text-white hover:bg-blue-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
