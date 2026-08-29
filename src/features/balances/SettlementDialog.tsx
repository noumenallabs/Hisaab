import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { getSupabase } from "@/lib/supabase"
import { formatMinor, parseCurrencyInput, fromMinor, decimalsFor } from "@/lib/currency"
import { ArrowRight, ExternalLink, Copy, Check } from "lucide-react"

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
  defaultNote,
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
  defaultNote?: string
  onSuccess?: () => void
}) {
  const baseCurrency = currency
  const dec = decimalsFor(baseCurrency)
  const [err, setErr] = useState<string | null>(null)
  const [amountStr, setAmountStr] = useState(String(fromMinor(outstandingMinor, dec)))
  const [method, setMethod] = useState("UPI")
  const [reference, setReference] = useState("")
  const [note, setNote] = useState(defaultNote ?? "")
  const [submitting, setSubmitting] = useState(false)
  const [copiedUpi, setCopiedUpi] = useState(false)
  const requestIdRef = useRef(crypto.randomUUID())
  const amountInputRef = useRef<HTMLInputElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)
  const amountMinor = parseCurrencyInput(amountStr, baseCurrency) ?? 0

  useEffect(() => {
    if (open) {
      setAmountStr(String(fromMinor(outstandingMinor, dec)))
      setErr(null)
      setNote(defaultNote ?? "")
      setCopiedUpi(false)
      requestIdRef.current = crypto.randomUUID()
      prevFocus.current = document.activeElement as HTMLElement | null
      setTimeout(() => amountInputRef.current?.focus(), 0)
    }
  }, [open, outstandingMinor, dec, defaultNote])

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

  const upiUri = `upi://pay?pn=${encodeURIComponent(toName ?? "Member")}&am=${fromMinor(amountMinor, dec)}&cu=${baseCurrency}&tn=${encodeURIComponent(note || "Trip settlement")}`

  async function handleCopyUpi() {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(upiUri)
        setCopiedUpi(true)
        setTimeout(() => setCopiedUpi(false), 2000)
      }
    } catch {
      // Fallback
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const minor = parseCurrencyInput(amountStr, baseCurrency)
    if (minor === null || minor <= 0) return setErr(`Enter a valid amount in ${baseCurrency} (e.g. ${dec === 0 ? "1250" : "1250.50"}).`)
    if (minor > outstandingMinor) return setErr(`Amount ${formatMinor(minor, baseCurrency)} exceeds outstanding ${formatMinor(outstandingMinor, baseCurrency)}. Balances may have updated — refresh.`)
    try {
      setSubmitting(true)
      setErr(null)
      const supabase = getSupabase()
      if (!supabase) {
        onSuccess?.()
        onClose()
        return
      }
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
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settle-title"
    >
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!submitting) onClose()
        }}
        aria-hidden="true"
      />
      <form
        id="settle-dialog"
        onSubmit={submit}
        className="relative w-full border-t sm:border border-hair bg-surface p-6 shadow-2xl max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-3xl max-sm:max-h-[90dvh] max-sm:overflow-y-auto max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:max-w-md sm:rounded-2xl sm:my-8 animate-in slide-in-from-bottom duration-250 sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95"
      >
        {/* Mobile Grab Bar */}
        <div className="sm:hidden -mt-2 mb-4 flex justify-center" aria-hidden="true">
          <div className="h-1.5 w-12 rounded-full bg-hair" />
        </div>

        <h2 id="settle-title" className="text-lg font-bold text-ink">
          Record settlement
        </h2>
        <div className="mt-1.5 rounded-xl border border-hair bg-surface-inset/70 p-3 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-ink-soft">
            <span className="font-bold text-ink">{fromName ?? fromId.slice(0, 8)}</span>
            <ArrowRight size={13} className="text-brand shrink-0" />
            <span className="font-bold text-ink">{toName ?? toId.slice(0, 8)}</span>
          </div>
          <span className="font-mono font-bold text-ink tnum">
            Outstanding {formatMinor(outstandingMinor, baseCurrency)}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <label htmlFor="settle-amount" className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
            Amount ({baseCurrency})
          </label>
          <button
            type="button"
            onClick={() => {
              setAmountStr(String(fromMinor(outstandingMinor, dec)))
              if (err) setErr(null)
            }}
            className="min-h-11 inline-flex items-center text-xs font-bold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-lg px-1 cursor-pointer"
          >
            Full amount: {formatMinor(outstandingMinor, baseCurrency)}
          </button>
        </div>
        <input
          ref={amountInputRef}
          id="settle-amount"
          value={amountStr}
          onChange={(e) => {
            setAmountStr(e.target.value)
            if (err) setErr(null)
          }}
          placeholder={dec === 0 ? "e.g. 1250" : "e.g. 1250.50"}
          className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-3 font-mono text-base font-bold tabular-nums tnum outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          aria-describedby="settle-hint"
          aria-invalid={!!err}
        />
        <p id="settle-hint" className="mt-1 text-xs text-ink-faint">
          Outstanding {formatMinor(outstandingMinor, baseCurrency)} · Recording {formatMinor(amountMinor, baseCurrency)}
        </p>

        {/* Quick 1-Tap UPI Action Box */}
        {method === "UPI" && amountMinor > 0 && (
          <div className="mt-3.5 rounded-2xl border border-brand/20 bg-brand-soft/40 p-3.5 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-brand flex items-center gap-1.5">
                <span className="rounded bg-brand/10 px-1 py-0.5 text-[10px] font-extrabold uppercase text-brand">
                  UPI
                </span>
                Pay directly:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyUpi}
                  className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-hair bg-surface px-2.5 py-1.5 text-xs font-semibold text-ink shadow-2xs hover:bg-canvas active:scale-[0.98] transition-all cursor-pointer"
                  title="Copy UPI Deep Link to clipboard"
                  aria-label="Copy UPI link"
                >
                  {copiedUpi ? (
                    <>
                      <Check size={13} className="text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} className="text-ink-soft" />
                      <span>Copy link</span>
                    </>
                  )}
                </button>
                <a
                  href={upiUri}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open UPI App <ExternalLink size={12} />
                </a>
              </div>
            </div>
            <p className="text-[11px] text-ink-soft">
              Opens GPay, PhonePe, or Paytm with {formatMinor(amountMinor, baseCurrency)} pre-filled.
            </p>
          </div>
        )}

        <label htmlFor="settle-method" className="mt-3.5 block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Payment Method
        </label>
        <select
          id="settle-method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-3 text-sm font-medium outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
        >
          {["UPI", "Cash", "Bank Transfer", "Card", "Other"].map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label htmlFor="settle-ref" className="mt-3 block text-xs font-semibold text-ink-soft">
          REFERENCE
        </label>
        <input
          id="settle-ref"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. UPI / Transaction ID"
          className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-3 text-sm text-ink outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        />
        <label htmlFor="settle-note" className="mt-3 block text-xs font-semibold text-ink-soft">
          NOTE
        </label>
        <textarea
          id="settle-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Optional note..."
          className="mt-1 w-full rounded-xl border border-hair bg-surface px-3 py-3 text-sm text-ink outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        />
        {err && (
          <p role="alert" className="mt-2 rounded-xl bg-owe-soft px-3 py-2 text-sm font-medium text-owe">
            {err}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-hair px-5 text-sm font-semibold text-ink hover:bg-canvas active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
          >
            Cancel
          </button>
          <button
            disabled={submitting}
            className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:opacity-50 shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
          >
            Confirm {formatMinor(amountMinor, baseCurrency)}
          </button>
        </div>
      </form>
    </div>,
    document.body
  )
}
