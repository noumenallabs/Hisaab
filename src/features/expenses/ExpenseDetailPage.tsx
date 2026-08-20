import { Link, useParams, useNavigate } from "react-router"
import { getSupabase } from "@/lib/supabase"
import { formatMinor } from "@/lib/currency"
import { softDeleteExpense, restoreExpense } from "./api"
import { useToast } from "@/components/feedback/ToastProvider"
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog"
import { useTrip } from "@/features/trips/hooks"
import { useTripMembers } from "@/features/trips/useMembers"
import { useExpense } from "./hooks"
import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { toUserMessage } from "@/lib/errors"
import { getSignedReceiptUrl } from "@/lib/receipts"

export function ExpenseDetailPage() {
  const { tripId, expenseId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [confirm, setConfirm] = useState(false)
  const [pendingDel, setPendingDel] = useState(false)
  const [pendingRestore, setPendingRestore] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [showLightbox, setShowLightbox] = useState(false)
  const supabase = getSupabase()
  const { data: trip } = useTrip(tripId ?? "")
  const { data: realMembers } = useTripMembers(tripId ?? "")
  const { data: realExp, isLoading } = useExpense(tripId ?? "", expenseId ?? "")
  const isArchived = (trip as any)?.status === "archived"

  const memberMap = new Map((realMembers ?? []).map((m: any) => [m.user_id ?? m.id, m.name ?? m.email ?? m.user_id?.slice(0, 8)]))
  const isLoadingDetail = isLoading
  const receiptPath = (realExp as any)?.receipt_path

  useEffect(() => {
    if (!showLightbox) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowLightbox(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [showLightbox])

  useEffect(() => {
    if (!receiptPath || !supabase) return
    let cancelled = false
    getSignedReceiptUrl(receiptPath as string).then((u) => {
      if (!cancelled) setSignedUrl(u)
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [receiptPath, supabase])

  if (isLoadingDetail) {
    return <div className="h-40 animate-pulse rounded-xl bg-hair/40" aria-label="Loading expense" />
  }
  if (!supabase) return <div className="p-6 text-center text-sm text-ink-soft" role="alert">Supabase not configured — check env.</div>
  let exp: any = realExp

  function nameOf(id: string) {
    return memberMap.get(id) ?? id.slice(0, 8)
  }

  if (!exp)
    return (
      <div className="p-6 text-center text-sm text-ink-soft" role="status">
        Expense not found. It may have been deleted or you lack access.
        <div className="mt-3">
          <Link to={`/trips/${tripId}/expenses`} className="text-sm font-semibold text-brand">← Back to expenses</Link>
        </div>
      </div>
    )

  const payers = exp.expense_payers ?? exp.payers ?? []
  const splits = exp.expense_splits ?? exp.splits ?? []
  const amountMinor = exp.amount_minor ?? exp.amount ?? 0
  const currency = (exp.currency ?? (trip as any)?.base_currency ?? "INR") as string

  async function del() {
    setPendingDel(true); setDelError(null)
    try {
      if (supabase) await softDeleteExpense(expenseId!, crypto.randomUUID())
      toast("Expense deleted", "success")
      setConfirm(false)
      navigate(`/trips/${tripId}/expenses`)
    } catch (e: any) {
      const msg = toUserMessage(e.message ?? e)
      setDelError(msg)
      toast(msg, "error")
      throw e
    } finally { setPendingDel(false) }
  }
  async function restore() {
    setPendingRestore(true); setDelError(null)
    try {
      if (supabase) await restoreExpense(expenseId!, crypto.randomUUID())
      toast("Expense restored", "success")
      navigate(`/trips/${tripId}/expenses`)
    } catch (e: any) {
      const msg = toUserMessage(e.message ?? e)
      setDelError(msg)
      toast(msg, "error")
    } finally { setPendingRestore(false) }
  }

  return (
    <div className="space-y-4">
      <Link to={`/trips/${tripId}/expenses`} className="text-sm font-semibold text-brand">
        ← Back to expenses
      </Link>
      <div className="rounded-xl border border-hair bg-surface p-6 shadow-sm">
        <h2 className="text-xl font-bold">{exp.description}</h2>
        <p className="text-sm text-ink-soft">
          {exp.category} · {exp.expense_date ?? exp.date} {exp.currency ? `· ${exp.currency}` : ""}
        </p>
        <p className="mt-3 font-mono text-xl font-bold tracking-tight">{formatMinor(amountMinor, currency)}</p>
        <p className="mt-1 text-xs text-ink-faint">Updated {exp.updated_at ? new Date(exp.updated_at).toLocaleString() : "—"} {exp.updated_by ? `by ${nameOf(exp.updated_by)}` : ""}</p>
        {exp.notes && <p className="mt-3 text-sm leading-6 text-ink-soft bg-canvas/50 p-3 rounded-lg border border-hair/50">{exp.notes}</p>}
        {exp.receipt_path && (
          <div className="mt-3 rounded-xl border border-hair bg-canvas/40 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Receipt Attachment</p>
            {signedUrl ? (
              exp.receipt_path.endsWith(".pdf") ? (
                <a href={signedUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline">
                  📄 View PDF Receipt (Opens new tab)
                </a>
              ) : (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setShowLightbox(true)}
                    className="group relative block overflow-hidden rounded-lg border border-hair"
                    aria-label="View full receipt"
                  >
                    <img src={signedUrl} alt={`Receipt for ${exp.description}`} className="max-h-56 rounded-lg object-contain transition-transform group-hover:scale-105" />
                    <span className="absolute bottom-2 right-2 rounded-md bg-ink/75 px-2 py-1 text-[11px] font-semibold text-white backdrop-blur-xs">
                      🔍 Tap to zoom
                    </span>
                  </button>
                </div>
              )
            ) : <p className="text-xs text-ink-faint mt-1">Loading receipt preview…</p>}
          </div>
        )}
        <div className="mt-2 text-xs text-ink-faint">Created by {exp.created_by?.slice(0, 8)} · {exp.created_at ?? ""}</div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div className="rounded-xl border border-hair bg-canvas/30 p-3">
            <b className="text-xs font-bold uppercase tracking-wider text-ink-soft">Payers</b>
            <ul className="mt-2 space-y-1 text-sm font-medium">
              {payers.map((p: any) => (
                <li key={p.user_id ?? p.userId} className="flex justify-between">
                  <span>{nameOf(p.user_id ?? p.userId)}</span>
                  <span className="font-mono text-ink">{formatMinor(p.amount_paid_minor ?? p.amount ?? p.amountPaidMinor ?? 0, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-hair bg-canvas/30 p-3">
            <b className="text-xs font-bold uppercase tracking-wider text-ink-soft">Splits</b>
            <ul className="mt-2 space-y-1 text-sm font-medium">
              {splits.map((s: any) => (
                <li key={s.user_id ?? s.userId} className="flex justify-between">
                  <span>{nameOf(s.user_id ?? s.userId)}</span>
                  <span className="font-mono text-ink">{formatMinor(s.amount_owed_minor ?? s.amount ?? s.amountOwedMinor ?? 0, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {isArchived && <p role="alert" className="mt-4 rounded-md bg-ink px-3 py-2 text-sm font-semibold text-white">Archived — read-only.</p>}
        <div className="mt-4 rounded-lg border border-hair bg-canvas p-3">
          <p className="text-xs font-semibold">History</p>
          <p className="mt-1 text-xs text-ink-soft">Created {exp.created_at ? new Date(exp.created_at).toLocaleString() : "—"} by {exp.created_by ? nameOf(exp.created_by) : "—"}</p>
          {exp.updated_at && exp.updated_at !== exp.created_at && <p className="text-xs text-ink-soft">Updated {new Date(exp.updated_at).toLocaleString()} {exp.updated_by ? `by ${nameOf(exp.updated_by)}` : ""}</p>}
          {exp.deleted_at && <p className="text-xs text-owe">Deleted {new Date(exp.deleted_at).toLocaleString()}</p>}
        </div>
        <div className="mt-6 flex gap-2">
          <Link
            to={`/trips/${tripId}/expenses/${expenseId}/edit`}
            className={`min-h-11 rounded-xl border border-hair px-5 py-2 text-sm font-bold hover:bg-canvas transition-colors ${isArchived ? "pointer-events-none opacity-50" : ""}`}
            aria-disabled={isArchived}
          >
            Edit
          </Link>
          {!exp.deleted_at ? (
            <button onClick={() => setConfirm(true)} disabled={!!isArchived} className="min-h-11 rounded-xl bg-owe px-5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
              Delete
            </button>
          ) : (
            <button onClick={restore} disabled={pendingRestore || !!isArchived} className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white disabled:opacity-50 transition-colors">
              {pendingRestore ? "Restoring…" : "Restore"}
            </button>
          )}
        </div>
        {delError && <p role="alert" className="mt-2 text-xs text-owe">{delError}</p>}
      </div>

      {/* Fullscreen Receipt Lightbox */}
      {showLightbox && signedUrl && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Receipt preview lightbox"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={() => setShowLightbox(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-surface p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hair px-3 py-2">
              <span className="text-xs font-bold text-ink-soft">Receipt: {exp.description}</span>
              <div className="flex gap-2">
                <a
                  href={signedUrl}
                  download="receipt"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-canvas px-2.5 py-1 text-xs font-semibold text-brand hover:bg-hair"
                >
                  Download
                </a>
                <button
                  onClick={() => setShowLightbox(false)}
                  className="flex h-6 w-6 items-center justify-center rounded-md bg-canvas text-xs font-bold text-ink-soft hover:text-ink"
                  aria-label="Close lightbox"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-2 flex items-center justify-center max-h-[80vh] overflow-auto">
              <img src={signedUrl} alt={`Full receipt for ${exp.description}`} className="max-h-[75vh] w-auto rounded-lg object-contain" />
            </div>
          </div>
        </div>,
        document.body
      )}

      <ConfirmDialog open={confirm} pending={pendingDel} error={delError} onClose={() => { if (!pendingDel) { setConfirm(false); setDelError(null) } }} onConfirm={del} title="Delete expense?" description="This soft-deletes the expense. An owner can restore it later." danger confirmLabel="Delete" />
    </div>
  )
}
