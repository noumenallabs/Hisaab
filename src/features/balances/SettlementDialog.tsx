import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { getSupabase } from "@/lib/supabase"
import { formatMinor, parseCurrencyInput, fromMinor, decimalsFor } from "@/lib/currency"

export function SettlementDialog({
  open,
  onClose,
  tripId,
  fromId,
  toId,
  fromName,
  toName,
  outstandingMinor,
  currency = "INR",
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  tripId: string
  fromId: string
  toId: string
  fromName?: string
  toName?: string
  outstandingMinor: number
  currency?: string
  onSuccess?: () => void
}) {
  const baseCurrency = currency
  const dec = decimalsFor(baseCurrency)
  const [err, setErr] = useState<string | null>(null)
  const [amountStr, setAmountStr] = useState(String(fromMinor(outstandingMinor, dec)))
  const [method, setMethod] = useState("UPI")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const requestIdRef = useRef(crypto.randomUUID())
  const amountInputRef = useRef<HTMLInputElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)
  const amountMinor = parseCurrencyInput(amountStr, baseCurrency) ?? 0

  useEffect(() => {
    if (open) {
      setAmountStr(String(fromMinor(outstandingMinor, dec)))
      setErr(null)
      requestIdRef.current = crypto.randomUUID()
      prevFocus.current = document.activeElement as HTMLElement | null
      setTimeout(() => amountInputRef.current?.focus(), 0)
    }
  }, [open, outstandingMinor, dec])

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose()
      if (e.key === "Tab") {
        const dialog = document.getElementById("settle-dialog")
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
    window.addEventListener("keydown", h)
    document.body.style.overflow = "hidden"
    const appRoot = document.getElementById("root")
    if (appRoot) appRoot.setAttribute("aria-hidden", "true")

    return () => {
      window.removeEventListener("keydown", h)
      document.body.style.overflow = ""
      if (appRoot) appRoot.removeAttribute("aria-hidden")
      prevFocus.current?.focus()
    }
  }, [open, onClose, submitting])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const minor = parseCurrencyInput(amountStr, baseCurrency)
    if (minor === null || minor <= 0) return setErr(`Enter a valid amount in ${baseCurrency} (e.g. ${dec === 0 ? "1250" : "1250.50"}).`)
    if (minor > outstandingMinor) return setErr(`Amount ${formatMinor(minor, baseCurrency)} exceeds outstanding ${formatMinor(outstandingMinor, baseCurrency)}. Balances may have updated — refresh.`)
    try {
      setSubmitting(true)
      setErr(null)
      const supabase = getSupabase()
      if (!supabase) throw new Error("Supabase not configured")
      let customUserId: string | null = null
      try {
        const stored = localStorage.getItem("tripsplit:custom-user")
        if (stored) customUserId = JSON.parse(stored)?.id ?? null
      } catch {}

      const { error } = await supabase.rpc("record_settlement", {
        p_payload: {
          tripId,
          fromUserId: fromId,
          toUserId: toId,
          amountMinor: minor,
          paymentMethod: method.trim() || "UPI",
          reference: reference.trim() || null,
          note: note.trim() || null,
          settledAt: new Date().toISOString(),
          requestId: requestIdRef.current,
          userId: customUserId,
        }
      } as never)
      if (error) throw error
      onSuccess?.()
      onClose()
    } catch (e: any) {
      // preserve reference/note on BALANCE_CHANGED — don't clear, just surface error
      const { toUserMessage } = await import("@/lib/errors")
      setErr(toUserMessage(e.message ?? e))
    } finally { setSubmitting(false) }
  }
  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settle-title"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!submitting) onClose()
        }}
        aria-hidden="true"
      />
      <form
        id="settle-dialog"
        onSubmit={submit}
        className="relative w-full max-w-md rounded-xl bg-surface p-6 shadow-2xl"
      >
        <h2 id="settle-title" className="text-lg font-bold">
          Record settlement
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {fromName ?? fromId.slice(0, 8)} → {toName ?? toId.slice(0, 8)} · Outstanding{" "}
          {formatMinor(outstandingMinor, baseCurrency)}
        </p>
        <div className="mt-4 flex items-center justify-between">
          <label htmlFor="settle-amount" className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
            Amount ({baseCurrency})
          </label>
          <button
            type="button"
            onClick={() => setAmountStr(String(fromMinor(outstandingMinor, dec)))}
            className="text-xs font-semibold text-brand hover:underline"
          >
            Full amount: {formatMinor(outstandingMinor, baseCurrency)}
          </button>
        </div>
        <input
          ref={amountInputRef}
          id="settle-amount"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder={dec === 0 ? "e.g. 1250" : "e.g. 1250.50"}
          className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-3 text-base font-semibold tabular-nums outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          aria-describedby="settle-hint"
          aria-invalid={!!err}
        />
        <p id="settle-hint" className="mt-1 text-xs text-ink-faint">
          Outstanding {formatMinor(outstandingMinor, baseCurrency)} · Recording {formatMinor(amountMinor, baseCurrency)}
        </p>
        <label htmlFor="settle-method" className="mt-3 block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Payment Method
        </label>
        <select
          id="settle-method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-3 text-sm font-medium outline-none focus:border-brand"
        >
          {["UPI", "Cash", "Bank Transfer", "Card", "Other"].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label htmlFor="settle-ref" className="mt-3 block text-xs font-semibold">
          REFERENCE
        </label>
        <input
          id="settle-ref"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="mt-1 w-full min-h-11 rounded-md border border-hair px-3 py-3 text-sm"
        />
        <label htmlFor="settle-note" className="mt-3 block text-xs font-semibold">
          NOTE
        </label>
        <textarea
          id="settle-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-md border border-hair px-3 py-3 text-sm"
        />
        {err && (
          <p role="alert" className="mt-2 rounded-md bg-owe-soft px-3 py-2 text-sm font-medium text-owe">
            {err}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-hair px-4 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            disabled={submitting}
            className="min-h-11 rounded-md bg-brand px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            Confirm {formatMinor(amountMinor, baseCurrency)}
          </button>
        </div>
      </form>
    </div>,
    document.body
  )
}
