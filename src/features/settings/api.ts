import { getSupabase } from "@/lib/supabase"

function getActorUserId(): string | null {
  try {
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) return JSON.parse(stored)?.id ?? null
  } catch {}
  return null
}

export async function updateTrip(
  tripId: string,
  patch: Record<string, string>,
) {
  const supabase = getSupabase()!
  const actorId = getActorUserId()
  const { error } = await supabase.rpc("update_trip", {
    p_trip_id: tripId,
    p_patch: patch,
    p_request_id: crypto.randomUUID(),
    p_user_id: actorId,
  } as never)
  if (error) throw error
}
export async function changeMemberRole(
  tripId: string,
  userId: string,
  role: "owner" | "member",
) {
  const supabase = getSupabase()!
  const actorId = getActorUserId()
  const { error } = await supabase.rpc("change_member_role", {
    p_trip_id: tripId,
    p_user_id: userId,
    p_role: role,
    p_request_id: crypto.randomUUID(),
    p_actor_id: actorId,
  } as never)
  if (error) throw error
}
export async function removeMember(tripId: string, userId: string) {
  const supabase = getSupabase()!
  const actorId = getActorUserId()
  const { error } = await supabase.rpc("remove_trip_member", {
    p_trip_id: tripId,
    p_user_id: userId,
    p_request_id: crypto.randomUUID(),
    p_actor_id: actorId,
  } as never)
  if (error) throw error
}
export async function markSettled(tripId: string) {
  const supabase = getSupabase()!
  const actorId = getActorUserId()
  const { error } = await supabase.rpc("mark_trip_settled", {
    p_trip_id: tripId,
    p_request_id: crypto.randomUUID(),
    p_user_id: actorId,
  } as never)
  if (error) throw error
}
export async function reopenTrip(tripId: string) {
  const supabase = getSupabase()!
  const actorId = getActorUserId()
  const { error } = await supabase.rpc("reopen_trip", {
    p_trip_id: tripId,
    p_request_id: crypto.randomUUID(),
    p_user_id: actorId,
  } as never)
  if (error) throw error
}
export async function archiveTrip(tripId: string) {
  const supabase = getSupabase()!
  const actorId = getActorUserId()
  const { error } = await supabase.rpc("archive_trip", {
    p_trip_id: tripId,
    p_request_id: crypto.randomUUID(),
    p_user_id: actorId,
  } as never)
  if (error) throw error
}
export async function deleteTrip(tripId: string) {
  const supabase = getSupabase()!
  const actorId = getActorUserId()
  const { error } = await supabase.rpc("delete_trip", {
    p_trip_id: tripId,
    p_request_id: crypto.randomUUID(),
    p_user_id: actorId,
  } as never)
  if (error) throw error
}

export async function addTripMember(
  tripId: string,
  email: string,
  role: "owner" | "member" = "member",
) {
  const supabase = getSupabase()!
  const actorId = getActorUserId()
  const { data, error } = await supabase.rpc("add_trip_member", {
    p_trip_id: tripId,
    p_email: email.trim().toLowerCase(),
    p_role: role,
    p_request_id: crypto.randomUUID(),
    p_user_id: actorId,
  } as never)
  if (error) throw error
  return data
}
