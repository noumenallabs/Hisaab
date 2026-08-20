import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { listInvites, createInvite, revokeInvite } from "./api"
import { useState } from "react"
import { Copy, Plus, Ban, Check, Clock } from "lucide-react"
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog"
import { useToast } from "@/components/feedback/ToastProvider"

export function InviteManager({ tripId }: { tripId: string }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: invites, isLoading } = useQuery({ queryKey: ["invites", tripId], queryFn: () => listInvites(tripId) })
  const [copied, setCopied] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null)
  const [expiry, setExpiry] = useState("30")
  const [maxUses, setMaxUses] = useState("")

  const create = useMutation({
    mutationFn: () => {
      const days = Math.max(1, Math.min(90, Number(expiry) || 30))
      const mu = maxUses.trim() ? Math.max(1, Number(maxUses)) : null
      return createInvite(tripId, days, mu)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invites", tripId] }),
    onError: (e: any) => toast(e.message ?? "Failed to create invite"),
  })
  const revoke = useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invites", tripId] })
      setConfirmRevoke(null)
      toast("Invite revoked")
    },
    onError: (e: any) => toast(e.message ?? "Revoke failed"),
  })

  async function copy(text: string) {
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
      setCopied(text)
      toast("Copied")
      setTimeout(() => setCopied(null), 1500)
    } catch {
      toast("Copy failed — select and copy manually")
    }
  }

  const active = invites?.filter((i) => i.is_active) ?? []

  return (
    <section className="rounded-xl border border-hair bg-surface p-6" aria-labelledby="invite-heading">
      <h3 id="invite-heading" className="font-semibold">Invite codes</h3>
      <p className="mt-1 text-xs leading-5 text-ink-soft">
        This is the <b className="text-ink">sign-in for everyone else</b>. Share an active code — they join at <code className="rounded bg-canvas px-1 py-0.5 font-mono text-xs">/join/:code</code> without creating an account. Revoking disables old links instantly.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg bg-canvas p-3">
        <label className="text-xs font-semibold">Expires in <input value={expiry} onChange={(e) => setExpiry(e.target.value)} inputMode="numeric" className="ml-1 w-16 rounded border border-hair px-2 py-1.5 text-sm" aria-label="Expires in days" /> days</label>
        <label className="text-xs font-semibold">Max uses <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="∞" inputMode="numeric" className="ml-1 w-16 rounded border border-hair px-2 py-1.5 text-sm" aria-label="Max uses (empty unlimited)" /></label>
        <button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          aria-busy={create.isPending}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={16} /> {create.isPending ? "Generating…" : "Generate new"}
        </button>
      </div>

      {isLoading ? (
        <p className="mt-4 text-sm text-ink-soft" role="status">Loading invites…</p>
      ) : !invites?.length ? (
        <p className="mt-4 text-sm text-ink-soft" role="status">No invites yet. Generate one.</p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Invite codes">
          {invites.map((inv) => (
            <li key={inv.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-3 ${inv.is_active ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-800/60 dark:bg-emerald-950/40" : "border-hair bg-canvas opacity-70"}`} title={inv.is_active ? "Active — share this code" : inv.revoked_at ? "Revoked" : new Date(inv.expires_at) < new Date() ? "Expired" : `Max uses reached (${inv.use_count}/${inv.max_uses})`}>
              <div>
                <p className="flex items-center gap-2 font-mono text-sm font-bold tracking-[.16em]">
                  {inv.code}
                  {inv.is_active ? <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-wider text-white"><Check size={12} />Active</span> : <span className="rounded bg-hair px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-soft">Revoked/Expired</span>}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
                  <Clock size={12} /> expires {new Date(inv.expires_at).toLocaleString()} · used {inv.use_count}
                  {inv.max_uses ? `/${inv.max_uses}` : ""} {inv.revoked_at ? `· revoked ${new Date(inv.revoked_at).toLocaleString()}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => copy(inv.code)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-md border border-hair bg-surface px-2.5 text-xs font-semibold hover:bg-canvas"
                  aria-label={`Copy code ${inv.code}`}
                >
                  <Copy size={14} /> {copied === inv.code ? "Copied" : "Copy"}
                </button>
                <button
                  onClick={() => copy(`${window.location.origin}/join/${inv.code}`)}
                  className="inline-flex min-h-11 items-center rounded-md border border-hair bg-surface px-2.5 text-xs font-semibold hover:bg-canvas"
                  aria-label={`Copy link for ${inv.code}`}
                >
                  Copy link
                </button>
                {inv.is_active && (
                  <button
                    onClick={() => setConfirmRevoke(inv.id)}
                    disabled={revoke.isPending}
                    className="inline-flex min-h-11 items-center gap-1 rounded-md border border-owe/20 bg-owe-soft px-2.5 text-xs font-bold text-owe hover:bg-owe hover:text-white disabled:opacity-50"
                  >
                    <Ban size={14} /> Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {active.length > 0 && (
        <div className="mt-4 rounded-lg bg-brand-soft p-3 text-xs leading-5 text-ink-soft">
          Share: <code className="font-mono font-bold text-brand">{active.map((a) => a.code).join(", ")}</code> or link <code className="break-all font-mono text-ink">{window.location.origin}/join/{active[0].code}</code> {active.length > 1 && <span className="text-ink-faint">({active.length} active codes)</span>}
        </div>
      )}
      <ConfirmDialog open={!!confirmRevoke} onClose={() => setConfirmRevoke(null)} onConfirm={() => { if (confirmRevoke) revoke.mutate(confirmRevoke) }} title="Revoke invite?" description="This disables the link immediately. Anyone with the old link will see 'Invalid or revoked invite code.' This cannot be undone." confirmLabel="Revoke" danger pending={revoke.isPending} error={revoke.error ? String((revoke.error as any).message ?? revoke.error) : null} />
    </section>
  )
}
