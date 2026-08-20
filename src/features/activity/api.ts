import { getSupabase } from "@/lib/supabase"

export async function fetchAudit(
  tripId: string,
  cursor?: { created_at: string; id: number },
  limit = 20,
) {
  const supabase = getSupabase()
  if (!supabase) return []
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
  if (error) throw error
  return data
}
