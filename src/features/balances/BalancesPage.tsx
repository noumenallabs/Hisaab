import { useParams } from "react-router"
import { useBalances } from "./hooks"
import { simplifyDebts } from "./balanceMath"
import { getSupabase } from "@/lib/supabase"
import { useTripMembers } from "@/features/trips/useMembers"
import { formatMinor } from "@/lib/currency"
import { Skeleton } from "@/components/feedback/Skeleton"
import { SettlementDialog } from "./SettlementDialog"
import { useState } from "react"
import { useAuth } from "@/lib/auth"
import { useTrip } from "@/features/trips/hooks"
import { queryClient } from "@/lib/queryClient"

export function BalancesPage() {
  const { tripId } = useParams()
  const { data, isLoading } = useBalances(tripId!)
  const { data: membersData } = useTripMembers(tripId!)
  const { user } = useAuth()
  const { data: trip } = useTrip(tripId!)
  const supabase = getSupabase()
  const isArchived = (trip as any)?.status === "archived"
  const isSettled = (trip as any)?.status === "settled"
  const baseCurrency = (trip as any)?.base_currency ?? "INR"
  const [settle, setSettle] = useState<{ fromId: string; toId: string; amount: number } | null>(null)
  const members: any[] = (membersData ?? []).map((m) => ({ id: m.user_id, name: m.name, avatar: m.name.slice(0, 2).toUpperCase() } as any))
  const membersLoading = !membersData
  let rows: Record<string, { paid: number; owed: number; sent: number; received: number; net: number }> = {}
  let net: Record<string, number> = {}
  let transfers: { fromId: string; toId: string; amount: number }[] = []
  if (data) {
    const list = data as any[]
    rows = Object.fromEntries(
      list.map((r) => [r.user_id, { paid: r.paid_minor ?? 0, owed: r.owed_minor ?? 0, sent: r.sent_minor ?? 0, received: r.received_minor ?? 0, net: r.net_minor ?? 0 }])
    ) as any
    net = Object.fromEntries(list.map((r) => [r.user_id, r.net_minor ?? 0])) as any
    transfers = simplifyDebts(net)
  }
  if (supabase && isLoading) return <Skeleton className="h-40" />
  if (supabase && membersLoading) return <Skeleton className="h-40" />
  if (supabase && !membersLoading && members.length === 0) return <div className="rounded-md bg-owe-soft p-4 text-sm text-owe" role="alert">Failed to load members — please retry. <button onClick={() => queryClient.invalidateQueries({ queryKey: ["trip_members", tripId] })} className="ml-2 min-h-11 underline">Retry</button></div>
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Balances & Settlements</h1>
        <p className="text-xs text-ink-soft">Review each member's net position and settle debts with minimum transfers</p>
      </div>

      {isArchived && <p role="alert" className="rounded-xl border border-slate-700/60 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Archived — read-only. Settlements disabled.</p>}
      {isSettled && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-100 px-4 py-2.5 text-sm font-semibold text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300">Settled — all balances zero. Owner can reopen.</p>}
      {supabase && members.length === 1 && (
        <p className="text-sm text-ink-soft" role="status">Only you in this trip — invite others from Settings to split expenses.</p>
      )}

      {/* 2-Column Desktop Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Member Balances Grid */}
        <div className="space-y-4 lg:col-span-7">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft">Member Positions</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(members as any[]).map((m: any) => {
              const r = rows[m.id] ?? { paid: 0, owed: 0, sent: 0, received: 0, net: 0 }
              const v = r.net
              const isPositive = v > 0
              const isNegative = v < 0

              return (
                <div
                  key={m.id}
                  className="rounded-2xl border border-hair bg-surface p-4 shadow-2xs transition-all hover:shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                        {(m.name ?? "?")[0].toUpperCase()}
                      </span>
                      <p className="text-sm font-bold text-ink">{m.name}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        isPositive
                          ? "border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : isNegative
                          ? "border border-red-200 bg-red-100 text-red-800 dark:border-red-800/60 dark:bg-red-950/60 dark:text-red-300"
                          : "border border-hair bg-canvas text-ink-soft"
                      }`}
                    >
                      {isPositive ? "Receives" : isNegative ? "Owes" : "Settled"}
                    </span>
                  </div>

                  <p
                    className={`mt-3 font-mono text-xl font-bold tabular-nums tracking-tight ${
                      isPositive ? "text-emerald-600 dark:text-emerald-400" : isNegative ? "text-red-600 dark:text-red-400" : "text-ink"
                    }`}
                  >
                    {formatMinor(v, baseCurrency)}
                  </p>

                  <div className="mt-3 rounded-xl bg-canvas/50 p-2.5 text-xs grid grid-cols-2 gap-x-2 gap-y-1 border border-hair/30">
                    <div className="flex justify-between text-ink-soft"><span>Paid:</span> <span className="font-mono font-semibold text-ink">{formatMinor(r.paid, baseCurrency)}</span></div>
                    <div className="flex justify-between text-ink-soft"><span>Share:</span> <span className="font-mono font-semibold text-ink">{formatMinor(r.owed, baseCurrency)}</span></div>
                    <div className="flex justify-between text-ink-soft"><span>Sent:</span> <span className="font-mono font-semibold text-ink">{formatMinor(r.sent, baseCurrency)}</span></div>
                    <div className="flex justify-between text-ink-soft"><span>Recv:</span> <span className="font-mono font-semibold text-ink">{formatMinor(r.received, baseCurrency)}</span></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right Column: Simplified Transfers / Settle */}
        <div className="space-y-4 lg:col-span-5">
          <div className="rounded-2xl border border-hair bg-surface p-5 shadow-2xs sticky top-20">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft">Simplified Settlements</h2>
            <p className="mt-1 text-xs text-ink-faint">Optimized payment paths to clear all debts in fewest transfers</p>

            {transfers.length === 0 ? (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-800/60 dark:bg-emerald-950/40">
                <p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">🎉 All settled up!</p>
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">No outstanding transfers required in this trip.</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-2.5">
                {transfers.map((t, i) => {
                  const canSettle = !isArchived && !isSettled && (user?.id === t.fromId || (membersData as any)?.find((m: any) => m.user_id === user?.id)?.role === "owner" || !supabase)
                  const fromMemberName = members.find((m) => m.id === t.fromId)?.name ?? "Member"
                  const toMemberName = members.find((m) => m.id === t.toId)?.name ?? "Member"

                  return (
                    <li key={i} className="flex items-center justify-between rounded-xl border border-hair bg-canvas/30 p-3 text-sm">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold text-ink">
                          <span className="font-bold text-red-600 dark:text-red-400">{fromMemberName}</span> pays <span className="font-bold text-emerald-600 dark:text-emerald-400">{toMemberName}</span>
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-bold text-ink">
                          {formatMinor(t.amount, baseCurrency)}
                        </p>
                      </div>
                      {canSettle && (
                        <button
                          onClick={() => setSettle(t)}
                          className="shrink-0 min-h-9 rounded-xl bg-brand px-3.5 text-xs font-bold text-white shadow-2xs hover:bg-blue-700 transition-colors"
                        >
                          Settle
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {settle && (
        <SettlementDialog
          open
          onClose={() => setSettle(null)}
          tripId={tripId!}
          fromId={settle.fromId}
          toId={settle.toId}
          fromName={members.find((m) => m.id === settle.fromId)?.name}
          toName={members.find((m) => m.id === settle.toId)?.name}
          outstandingMinor={settle.amount}
          currency={baseCurrency}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["balances", tripId] })
            queryClient.invalidateQueries({ queryKey: ["expenses", tripId] })
          }}
        />
      )}
    </div>
  )
}
