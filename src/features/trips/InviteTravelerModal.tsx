import { useEffect, useState } from "react"
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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-hair bg-surface p-6 shadow-2xl space-y-5 my-8">
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
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-canvas hover:text-ink transition-colors"
            aria-label="Close invite modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Highlighted Active Invite Box */}
        {isLoading || (activeInvites.length === 0 && create.isPending) ? (
          <div className="rounded-xl border border-hair bg-canvas/40 p-6 text-center text-xs text-ink-soft animate-pulse">
            Generating secure invite code…
          </div>
        ) : activeCode ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-brand/20 bg-gradient-to-br from-brand/10 via-surface to-surface p-5 text-center shadow-xs">
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
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(activeCode, "code")}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-hair bg-surface px-3.5 text-xs font-bold text-ink shadow-2xs hover:bg-canvas transition-colors"
                  aria-label={`Copy invite code ${activeCode}`}
                >
                  {copiedCode === activeCode ? (
                    <>
                      <Check size={14} className="text-emerald-500" /> Copied
                      Code
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
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-brand px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition-colors"
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
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-bold text-emerald-700 dark:text-emerald-300 shadow-2xs hover:bg-emerald-500/20 transition-colors"
            >
              <MessageCircle size={15} /> Share via WhatsApp
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
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Plus size={15} />{" "}
              {create.isPending ? "Generating…" : "Generate Invite Code"}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-1 border-t border-hair/50">
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-xl border border-hair px-4 text-xs font-semibold hover:bg-canvas transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
