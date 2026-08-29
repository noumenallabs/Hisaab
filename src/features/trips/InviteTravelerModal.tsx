import { useEffect, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { listInvites, createInvite } from "./api"
import {
  Copy,
  Plus,
  Check,
  X,
  MessageCircle,
  Link2,
  Sparkles,
  ShieldCheck,
} from "lucide-react"
import { useToast } from "@/components/feedback/ToastProvider"

export function InviteTravelerModal({
  open,
  onClose,
  tripId,
  tripName = "Trip",
}: {
  open: boolean
  onClose: () => void
  tripId: string
  tripName?: string
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const prevFocus = useRef<HTMLElement | null>(null)

  const { data: invites, isLoading } = useQuery({
    queryKey: ["invites", tripId],
    queryFn: () => listInvites(tripId),
    enabled: open && !!tripId,
  })

  const activeInvites = invites?.filter((i) => i.is_active) ?? []

  const create = useMutation({
    mutationFn: () => createInvite(tripId, 30, null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites", tripId] })
      toast("New invite code generated!", "success")
    },
    onError: (e: any) => toast(e.message ?? "Failed to create invite", "error"),
  })

  // Auto-generate invite if none active and not loading
  useEffect(() => {
    if (
      open &&
      !isLoading &&
      invites &&
      activeInvites.length === 0 &&
      !create.isPending
    ) {
      create.mutate()
    }
  }, [open, isLoading, invites, activeInvites.length, create])

  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement as HTMLElement | null
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "Tab") {
        const dialog = document.getElementById("invite-dialog")
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

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const activeCode = activeInvites[0]?.code

  async function copyToClipboard(text: string, type: "code" | "link") {
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
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
      }
      if (type === "code") {
        setCopiedCode(text)
        setTimeout(() => setCopiedCode(null), 2000)
      } else {
        setCopiedLink(text)
        setTimeout(() => setCopiedLink(null), 2000)
      }
      toast(
        type === "code"
          ? "Invite code copied!"
          : "Join link copied to clipboard!",
        "success",
      )
    } catch {
      toast("Failed to copy. Please select and copy manually.", "error")
    }
  }

  function handleShareWhatsApp(code: string) {
    const joinUrl = `${origin}/join/${code}`
    const msg = `Hey! Join our trip "${tripName}" on SplitPurse to track shared expenses and balances: ${joinUrl} (Invite code: ${code})`
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`
    window.open(waUrl, "_blank", "noopener,noreferrer")
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 overflow-y-auto"
    >
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id="invite-dialog"
        className="relative w-full border-t sm:border border-hair bg-surface p-6 shadow-2xl space-y-5 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-3xl max-sm:max-h-[90dvh] max-sm:overflow-y-auto max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:max-w-md sm:rounded-2xl sm:my-8 animate-in slide-in-from-bottom duration-250 sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95"
      >
        {/* Mobile Grab Bar */}
        <div className="sm:hidden -mt-2 mb-2 flex justify-center" aria-hidden="true">
          <div className="h-1.5 w-12 rounded-full bg-hair" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-hair/50 pb-3">
          <div>
            <h2
              id="invite-modal-title"
              className="text-lg font-bold tracking-tight text-ink flex items-center gap-2"
            >
              <Sparkles size={18} className="text-brand" /> Invite Travelers
            </h2>
            <p className="text-xs text-ink-soft">
              Share the invite code or direct join link with your crew
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft hover:bg-canvas hover:text-ink active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
            aria-label="Close invite modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Highlighted Active Invite Box */}
        {isLoading || (activeInvites.length === 0 && create.isPending) ? (
          <div className="rounded-2xl border border-hair bg-canvas/40 p-6 text-center text-xs text-ink-soft animate-pulse">
            Generating secure invite code…
          </div>
        ) : activeCode ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-hair bg-canvas/60 p-5 text-center shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand">
                Active Trip Invite Code
              </p>
              <p className="mt-2 font-mono text-3xl font-extrabold tracking-[.2em] text-ink select-all">
                {activeCode}
              </p>
              <p className="mt-1 text-[11px] text-ink-faint">
                Valid for 30 days · No password needed to join
              </p>

              {/* Action Buttons Row */}
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(activeCode, "code")}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-hair bg-surface px-3.5 text-xs font-bold text-ink shadow-2xs hover:bg-canvas active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
                  aria-label={`Copy invite code ${activeCode}`}
                >
                  {copiedCode === activeCode ? (
                    <>
                      <Check size={14} className="text-emerald-500" /> Copied Code
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copy Code
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    copyToClipboard(`${origin}/join/${activeCode}`, "link")
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-brand px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
                  aria-label="Copy direct join link"
                >
                  {copiedLink === `${origin}/join/${activeCode}` ? (
                    <>
                      <Check size={14} className="text-white" /> Copied Link
                    </>
                  ) : (
                    <>
                      <Link2 size={14} /> Copy Join Link
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Direct WhatsApp Share Button */}
            <button
              type="button"
              onClick={() => handleShareWhatsApp(activeCode)}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-bold text-emerald-700 dark:text-emerald-300 shadow-2xs hover:bg-emerald-500/20 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
            >
              <MessageCircle size={16} /> Share via WhatsApp
            </button>

            {/* Trust badge / Explanation */}
            <div className="flex items-start gap-2.5 rounded-xl bg-canvas/60 p-3 text-xs text-ink-soft">
              <ShieldCheck size={16} className="text-brand shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                Travelers joining with this code instantly gain access to view
                expenses, log receipts, and see zero-sum balances.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-ink-soft text-center">
              No active invite codes currently exist for this trip.
            </p>
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
            >
              <Plus size={16} />{" "}
              {create.isPending ? "Generating…" : "Generate Invite Code"}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-1 border-t border-hair/50">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-hair px-5 text-xs font-semibold hover:bg-canvas active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
