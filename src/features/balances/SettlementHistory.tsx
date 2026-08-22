import { useState } from "react"
import { formatMinor } from "@/lib/currency"
import { History, ChevronDown, ChevronUp, CheckCircle2, ArrowRight } from "lucide-react"

export function SettlementHistory({
  settlements,
  memberMap,
  baseCurrency,
}: {
  settlements: any[]
  memberMap: Map<string, string>
  baseCurrency: string
}) {
  const [isExpanded, setIsExpanded] = useState(true)
  const activeSettlements = (settlements ?? []).filter((s) => !s.deleted_at)

  if (!activeSettlements.length) return null

  return (
    <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <History size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink">
                Settlement History
              </h2>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                {activeSettlements.length} confirmed
              </span>
            </div>
            <p className="text-xs text-ink-soft">
              Record of direct settlements paid between group members
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-hair bg-surface text-ink-soft hover:bg-canvas"
          aria-label={isExpanded ? "Collapse history" : "Expand history"}
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {isExpanded && (
        <ul className="mt-4 space-y-2.5" aria-label="Settlement list">
          {activeSettlements.map((s) => {
            const fromName = memberMap.get(s.from_user_id) ?? "Member"
            const toName = memberMap.get(s.to_user_id) ?? "Member"

            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hair bg-canvas/30 p-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />
                    <span className="font-bold text-ink">
                      {fromName}
                    </span>
                    <ArrowRight size={13} className="text-ink-faint" />
                    <span className="font-bold text-ink">
                      {toName}
                    </span>
                    <span className="rounded-md border border-hair bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink-soft uppercase">
                      {s.payment_method || "Payment"}
                    </span>
                  </div>

                  <p className="text-[11px] text-ink-faint pl-6">
                    {new Date(s.settled_at || s.created_at).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {s.reference && ` · Ref: ${s.reference}`}
                  </p>
                  {s.note && (
                    <p className="text-[11px] text-ink-soft italic pl-6">
                      "{s.note}"
                    </p>
                  )}
                </div>

                <div className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 pl-6 sm:pl-0">
                  {formatMinor(s.amount_minor, baseCurrency)}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
