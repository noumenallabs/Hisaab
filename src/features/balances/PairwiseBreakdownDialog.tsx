import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { formatMinor } from "@/lib/currency"
import { computePairwiseLedger } from "./categoryMath"
import { X, Receipt } from "lucide-react"

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
  const prevFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement as HTMLElement | null
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "Tab") {
        const dialog = document.getElementById("pairwise-dialog")
        if (!dialog) return
        const nodes = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
          )
        ).filter((el) => !el.hasAttribute("disabled"))
        if (!nodes.length) return
        const first = nodes[0],
          last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", handleKey)
    document.body.style.overflow = "hidden"
    const appRoot = document.getElementById("root")
    if (appRoot) appRoot.setAttribute("aria-hidden", "true")

    return () => {
      window.removeEventListener("keydown", handleKey)
      document.body.style.overflow = ""
      if (appRoot) appRoot.removeAttribute("aria-hidden")
      prevFocus.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const ledger = computePairwiseLedger(expenses, toId, fromId)
  // toId = A (creditor/receiver), fromId = B (debtor/payer)
  // ledger.netPairwiseMinor > 0 means B owes A directly

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pairwise-title"
    >
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id="pairwise-dialog"
        className="relative w-full border-t sm:border border-hair bg-surface p-6 shadow-2xl space-y-4 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-3xl max-sm:max-h-[90dvh] max-sm:overflow-y-auto max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:max-w-lg sm:max-h-[85vh] sm:rounded-2xl sm:my-8 animate-in slide-in-from-bottom duration-250 sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95"
      >
        {/* Mobile Grab Bar */}
        <div className="sm:hidden -mt-2 mb-2 flex justify-center" aria-hidden="true">
          <div className="h-1.5 w-12 rounded-full bg-hair" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between border-b border-hair pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="pairwise-title" className="text-lg font-bold tracking-tight text-ink">
                Pairwise Expense Ledger
              </h2>
            </div>
            <p className="text-xs text-ink-soft">
              Direct shared expenses between <b className="text-ink">{fromName}</b> and <b className="text-ink">{toName}</b>
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft hover:bg-canvas hover:text-ink active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Transfer vs Direct Comparison Card */}
        <div className="rounded-2xl border border-hair bg-canvas/40 p-4 text-xs space-y-2">
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
                      <Receipt size={14} className="text-brand shrink-0" />
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
            className="min-h-11 rounded-xl bg-brand px-6 text-xs font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 max-sm:w-full cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
