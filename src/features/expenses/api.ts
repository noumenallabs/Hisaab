import { getSupabase } from "@/lib/supabase"
import type { SaveExpenseInput } from "./schemas"

function getActorUserId(): string | null {
  try {
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) return JSON.parse(stored)?.id ?? null
  } catch {}
  return null
}

export async function saveExpense(input: SaveExpenseInput) {
  const supabase = getSupabase()
  if (!supabase) throw new Error("Supabase not configured")
  const actorId = getActorUserId()
  const payload = {
    ...input,
    userId: (input as any).userId || actorId,
  }
  const { data, error } = await supabase.rpc("save_expense", {
    p_payload: payload as unknown as never,
  } as never)
  if (error) throw error
  return data
}
export async function softDeleteExpense(expenseId: string, requestId: string) {
  const supabase = getSupabase()!
  const actorId = getActorUserId()
  const { error } = await supabase.rpc("soft_delete_expense", {
    p_expense_id: expenseId,
    p_request_id: requestId,
    p_user_id: actorId,
  } as never)
  if (error) throw error
}
export async function restoreExpense(expenseId: string, requestId: string) {
  const supabase = getSupabase()!
  const actorId = getActorUserId()
  const { error } = await supabase.rpc("restore_expense", {
    p_expense_id: expenseId,
    p_request_id: requestId,
    p_user_id: actorId,
  } as never)
  if (error) throw error
}
export async function fetchExpenses(tripId: string, opts?: { includeDeleted?: boolean }) {
  const supabase = getSupabase()
  if (!supabase || !tripId) return []

  // 1. Try RPC get_trip_expenses_list
  let customUserId: string | null = null
  try {
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) customUserId = JSON.parse(stored)?.id ?? null
  } catch {}

  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_trip_expenses_list", {
      p_trip_id: tripId,
      p_user_id: customUserId,
      p_include_deleted: opts?.includeDeleted ?? false,
    } as never)
    if (!rpcErr && rpcData && Array.isArray(rpcData)) {
      return rpcData as any[]
    }
  } catch {}

  // 2. Direct query fallback
  try {
    let q = supabase
      .from("expenses")
      .select("*, expense_payers(*), expense_splits(*)")
      .eq("trip_id", tripId)
      .order("expense_date", { ascending: false })
    if (!opts?.includeDeleted) q = (q as any).is("deleted_at", null)
    const { data, error } = await q
    if (error) return []
    return data ?? []
  } catch {
    return []
  }
}

export async function fetchExpense(tripId: string, expenseId: string) {
  const all = await fetchExpenses(tripId, { includeDeleted: true })
  return (all as any[]).find((e) => e.id === expenseId) ?? null
}
