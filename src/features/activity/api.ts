import { getSupabase } from "@/lib/supabase"

export async function fetchAudit(
  tripId: string,
  cursor?: { created_at: string; id: number },
  limit = 20,
) {
  const supabase = getSupabase()
  if (!supabase || !tripId) return []

  let customUserId: string | null = null
  try {
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) customUserId = JSON.parse(stored)?.id ?? null
  } catch {}

  // 1. Try RPC get_trip_audit_logs
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_trip_audit_logs", {
      p_trip_id: tripId,
      p_user_id: customUserId,
      p_limit: limit,
      p_cursor_created_at: cursor?.created_at ?? null,
      p_cursor_id: cursor?.id ?? null,
    } as never)
    if (!rpcErr && rpcData && Array.isArray(rpcData)) {
      return rpcData as any[]
    }
  } catch {}

  // 2. Direct table fallback for authenticated sessions
  let q = supabase
    .from("audit_logs")
    .select("*")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit)
  if (cursor) {
    // Stable cursor (created_at, id) — handles equal timestamps per spec §7.9
    q = q.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
    )
  }
  const { data, error } = await q
  if (error) return []
  return data ?? []
}
