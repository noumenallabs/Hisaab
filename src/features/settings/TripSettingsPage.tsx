import { useParams, useNavigate } from "react-router"
import { useTrip } from "@/features/trips/hooks"
import { archiveTrip, deleteTrip, markSettled, reopenTrip, removeMember, changeMemberRole, addTripMember } from "./api"
import { InviteManager } from "@/features/trips/InviteManager"
import { getSupabase } from "@/lib/supabase"
import { useTripMembers } from "@/features/trips/useMembers"
import { useState } from "react"
import { useToast } from "@/components/feedback/ToastProvider"
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog"
import { useIsAdmin } from "@/lib/useAdmin"
import { useAuth } from "@/lib/auth"
import { useQueryClient } from "@tanstack/react-query"
import { useOnline } from "@/lib/network"
import { tripMembersKeys } from "@/features/trips/useMembers"
import { UserAvatar } from "@/components/feedback/UserAvatar"

export function TripSettingsPage() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const { data: trip } = useTrip(tripId!)
  const { data: realMembers } = useTripMembers(tripId!)
  const { toast } = useToast()
  const [confirm, setConfirm] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { data: isAdmin } = useIsAdmin()
  const { user } = useAuth()
  const isArchived = trip?.status === "archived"
  const supabase = getSupabase()
  const members = realMembers ?? []
  const membersLoading = !realMembers
  const currentRole = (realMembers as any)?.find((m: any) => m.user_id === user?.id)?.role
  const isOwner = currentRole === "owner"
  const roleUnresolved = !realMembers
  const qc = useQueryClient()
  const online = useOnline()
  const [pendingConfirm, setPendingConfirm] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [addEmail, setAddEmail] = useState("")
  const [addRole, setAddRole] = useState<"member" | "owner">("member")
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  async function act(fn: () => Promise<void>, msg: string) {
    try {
      await fn()
      toast(msg, "success")
      qc.invalidateQueries({ queryKey: tripMembersKeys.list(tripId!) })
      qc.invalidateQueries({ queryKey: ["trip", tripId] })
    } catch (e: any) {
      const { toUserMessage } = await import("@/lib/errors")
      toast(toUserMessage(e.message ?? e), "error")
      qc.invalidateQueries({ queryKey: tripMembersKeys.list(tripId!) })
      throw e
    }
  }
  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    if (!addEmail.trim()) return
    try {
      setIsAdding(true)
      setAddError(null)
      await addTripMember(tripId!, addEmail.trim(), addRole)
      toast(`Added ${addEmail} to trip`, "success")
      setAddEmail("")
      qc.invalidateQueries({ queryKey: tripMembersKeys.list(tripId!) })
      qc.invalidateQueries({ queryKey: ["trip", tripId] })
    } catch (err: any) {
      const msg = String(err?.message ?? err)
      if (msg.includes("ALREADY_MEMBER")) {
        setAddError("This user is already a member of the trip.")
      } else if (msg.includes("invalid_email")) {
        setAddError("Please enter a valid email address.")
      } else {
        const { toUserMessage } = await import("@/lib/errors")
        setAddError(toUserMessage(msg))
      }
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold">Trip settings</h2>
      <div className="rounded-2xl border border-hair bg-surface p-6 shadow-2xs">
        <h3 className="font-bold text-base text-ink">{trip?.name ?? "Trip"}</h3>
        <p className="text-xs text-ink-soft mt-0.5 capitalize">
          {trip?.destination} · {trip?.base_currency} · <span className="font-semibold text-brand">{trip?.status}</span>
        </p>
        {!getSupabase() && (
          <p className="mt-3 text-xs text-ink-faint">
            Demo mode — membership controls are disabled until Supabase is
            connected.
          </p>
        )}
      </div>
      {getSupabase() && !isArchived && isOwner ? <InviteManager tripId={tripId!} /> : getSupabase() && isArchived ? <p className="rounded-2xl border border-hair bg-canvas p-4 text-sm text-ink-soft" role="status">Archived — invite codes are read-only. Existing codes remain visible but no new codes can be generated.</p> : getSupabase() && !isArchived && !isOwner ? <p className="rounded-2xl border border-hair bg-canvas p-4 text-sm text-ink-soft" role="status">Only owners can generate or revoke invite codes.</p> : null}

      <section className="rounded-2xl border border-hair bg-surface p-6 shadow-2xs">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm uppercase tracking-wider text-ink">Members ({members.length})</h3>
        </div>
        {getSupabase() && !isArchived && isOwner && (
          <form onSubmit={handleAddMember} className="mt-4 flex flex-wrap items-center gap-2">
            <label htmlFor="add-member-email" className="sr-only">
              Member Email Address
            </label>
            <input
              id="add-member-email"
              type="email"
              value={addEmail}
              onChange={(e) => {
                setAddEmail(e.target.value)
                setAddError(null)
              }}
              placeholder="user@example.com"
              aria-label="Member email address"
              className="min-h-11 min-w-[200px] flex-1 rounded-xl border border-hair bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
              required
            />
            <label htmlFor="add-member-role" className="sr-only">
              Member Role
            </label>
            <select
              id="add-member-role"
              value={addRole}
              onChange={(e) => setAddRole(e.target.value as any)}
              aria-label="Member role"
              className="min-h-11 rounded-xl border border-hair bg-surface px-3 py-2 text-sm font-medium"
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
            <button
              type="submit"
              disabled={isAdding || !online || !addEmail.trim()}
              className="min-h-11 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-2xs"
            >
              {isAdding ? "Adding…" : "Add member"}
            </button>
          </form>
        )}
        {addError && <p role="alert" className="mt-2 text-xs font-semibold text-owe">{addError}</p>}
        {members.length === 0 && <p className="mt-3 text-sm text-ink-soft">Loading members…</p>}
        {members.length === 1 && <p className="mt-3 text-xs text-ink-soft">Only admin (you) is a member. Add members directly by email or invite them via invite code.</p>}
        <ul className="mt-4 space-y-2.5">
          {(members as any[]).map((m: any) => {
            const uid = m.user_id ?? m.id
            const role = m.role ?? "member"
            const isCurrentUser = uid === user?.id
            return (
            <li key={uid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hair bg-canvas/30 p-3.5 text-sm shadow-2xs">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <UserAvatar id={uid} name={m.name} isCurrentUser={isCurrentUser} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-ink truncate min-w-0">{m.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      role === "owner" ? "border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border border-hair bg-surface text-ink-soft"
                    }`}>
                      {role}
                    </span>
                  </div>
                  <span className="text-xs text-ink-faint truncate block mt-0.5">{m.email ?? uid.slice(0, 8)}</span>
                </div>
              </div>
              {getSupabase() && !isArchived && isOwner && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      act(
                        () =>
                          changeMemberRole(
                            tripId!,
                            uid,
                            role === "owner" ? "member" : "owner",
                          ),
                        "Role updated",
                      )
                    }
                    className="min-h-9 rounded-lg border border-hair bg-surface px-3 text-xs font-semibold text-ink hover:bg-canvas active:scale-[0.98] transition-all cursor-pointer"
                    aria-label={role === "owner" ? "Change to member" : "Promote to owner"}
                    disabled={roleUnresolved || !online}
                  >
                    {role === "owner" ? "Change to member" : "Promote to owner"}
                  </button>
                  <button
                    onClick={() => setConfirm(uid)}
                    className="min-h-9 rounded-lg border border-owe/20 bg-owe-soft px-3 text-xs font-bold text-owe hover:bg-owe hover:text-white active:scale-[0.98] transition-all cursor-pointer"
                    aria-label={`Remove ${m.name}`}
                    disabled={roleUnresolved || !online}
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
            )
          })}
        </ul>
        {roleUnresolved && getSupabase() && !isArchived && <p className="mt-2 text-xs text-ink-soft" role="status" aria-live="polite">Loading your role…</p>}
        {!roleUnresolved && !isOwner && getSupabase() && !isArchived && <p className="mt-2 text-xs text-ink-soft">Only owners can change roles or remove members.</p>}
        {confirm && (
          <ConfirmDialog
            open
            pending={pendingConfirm}
            error={confirmError}
            onClose={() => { if (!pendingConfirm) { setConfirm(null); setConfirmError(null) } }}
            onConfirm={async () => {
              setPendingConfirm(true); setConfirmError(null)
              try {
                await act(() => removeMember(tripId!, confirm), "Member removed")
                setConfirm(null)
              } catch (e: any) {
                const { toUserMessage } = await import("@/lib/errors")
                setConfirmError(toUserMessage(e.message ?? e))
              } finally { setPendingConfirm(false) }
            }}
            title="Remove member?"
            description="This removes the traveler from the trip. Only allowed with zero balance and at least one owner remains."
            danger
          />
        )}
      </section>
      {getSupabase() && !isArchived && isOwner && (
        <section className="flex flex-wrap gap-2">
          {trip?.status === "settled" ? (
            <button
              onClick={() => act(() => reopenTrip(tripId!), "Trip reopened")}
              className="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-2xs cursor-pointer"
            >
              Reopen trip
            </button>
          ) : (
            <button
              onClick={() => act(() => markSettled(tripId!), "Marked settled")}
              className="min-h-11 rounded-xl bg-brand px-5 text-sm font-bold text-white hover:bg-blue-700 active:scale-[0.98] transition-all shadow-2xs cursor-pointer"
            >
              Mark settled
            </button>
          )}
          <button
            onClick={() => act(() => archiveTrip(tripId!), "Archived")}
            className="min-h-11 rounded-xl border border-hair bg-surface px-4 text-sm font-semibold text-ink hover:bg-canvas active:scale-[0.98] transition-all cursor-pointer"
          >
            Archive trip
          </button>
          {isAdmin && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="min-h-11 rounded-xl bg-owe px-4 text-sm font-bold text-white hover:bg-red-700 active:scale-[0.98] transition-all shadow-2xs cursor-pointer"
              aria-label="Delete trip"
            >
              Delete trip
            </button>
          )}
        </section>
      )}
      {isArchived && (
        <>
          <p className="text-sm font-semibold text-owe">
            Archived trips are read-only.
          </p>
          {isAdmin && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="mt-3 min-h-11 rounded-xl bg-owe px-4 text-sm font-bold text-white hover:bg-red-700 active:scale-[0.98] transition-all cursor-pointer"
              aria-label="Delete trip"
            >
              Delete trip (admin)
            </button>
          )}
        </>
      )}
      {confirmDelete && (
        <ConfirmDialog
          open
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            try {
              await deleteTrip(tripId!)
              toast("Trip deleted")
              navigate("/trips")
            } catch (e: any) {
              toast(e.message ?? "Delete failed")
            } finally {
              setConfirmDelete(false)
            }
          }}
          title="Delete trip permanently?"
          description="This hard-deletes the trip, members, expenses and settlements. Only platform admins can do this. This cannot be undone."
          danger
        />
      )}
    </div>
  )
}
