import { getSupabase } from "@/lib/supabase"

export async function updateTrip(
  tripId: string,
  patch: Record<string, string>,
) {
  const supabase = getSupabase()!
  const { error } = await supabase.rpc("update_trip", {
    p_trip_id: tripId,
    p_patch: patch,
    p_request_id: crypto.randomUUID(),
  } as never)
  if (error) throw error
}
export async function changeMemberRole(
  tripId: string,
  userId: string,
  role: "owner" | "member",
) {
  const supabase = getSupabase()!
  const { error } = await supabase.rpc("change_member_role", {
    p_trip_id: tripId,
    p_user_id: userId,
    p_role: role,
    p_request_id: crypto.randomUUID(),
  } as never)
  if (error) throw error
}
export async function removeMember(tripId: string, userId: string) {
  const supabase = getSupabase()!
  const { error } = await supabase.rpc("remove_trip_member", {
    p_trip_id: tripId,
    p_user_id: userId,
    p_request_id: crypto.randomUUID(),
  } as never)
  if (error) throw error
}
export async function markSettled(tripId: string) {
  const supabase = getSupabase()!
  const { error } = await supabase.rpc("mark_trip_settled", {
    p_trip_id: tripId,
    p_request_id: crypto.randomUUID(),
  } as never)
  if (error) throw error
}
export async function archiveTrip(tripId: string) {
  const supabase = getSupabase()!
  const { error } = await supabase.rpc("archive_trip", {
    p_trip_id: tripId,
    p_request_id: crypto.randomUUID(),
  } as never)
  if (error) throw error
}
export async function deleteTrip(tripId: string) {
  const supabase = getSupabase()!
  const { error } = await supabase.rpc("delete_trip", {
    p_trip_id: tripId,
    p_request_id: crypto.randomUUID(),
  } as never)
  if (error) throw error
}

export async function addTripMember(
  tripId: string,
  email: string,
  role: "owner" | "member" = "member",
) {
  const supabase = getSupabase()!
  const { data, error } = await supabase.rpc("add_trip_member", {
    p_trip_id: tripId,
    p_email: email.trim().toLowerCase(),
    p_role: role,
    p_request_id: crypto.randomUUID(),
  } as never)
  if (error) throw error
  return data
}
