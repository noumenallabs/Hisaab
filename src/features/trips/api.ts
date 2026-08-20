import { getSupabase } from "@/lib/supabase"
export type Trip = {
  id: string; name: string; destination: string; start_date: string; end_date: string; base_currency: string; status: "active" | "settled" | "archived"
  created_by: string; memberCount?: number; role?: string; total?: number
}

export async function fetchTrips(): Promise<Trip[]> {
  const supabase = getSupabase()
  if (!supabase) return []

  let customUserId: string | null = null
  try {
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) customUserId = JSON.parse(stored)?.id ?? null
  } catch {}

  // 1. Try RPC get_user_trips (works for both authenticated users and passwordless / invite guests)
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_user_trips", {
      p_user_id: customUserId,
    } as never)
    if (!rpcErr && rpcData && Array.isArray(rpcData)) {
      return rpcData as unknown as Trip[]
    }
  } catch (err) {
    console.warn("[fetchTrips rpc]", err)
  }

  // 2. Direct table fallback for authenticated sessions
  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) {
    console.warn("[fetchTrips]", error.message)
    return []
  }
  return (data ?? []) as Trip[]
}

export async function fetchTrip(id: string): Promise<Trip | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  if (!isUuid) return null

  // 1. Try direct query
  try {
    const { data, error } = await supabase
      .from("trips")
      .select("*")
      .eq("id", id)
      .maybeSingle()
    if (!error && data) return data as unknown as Trip
  } catch {}

  // 2. Fallback to RPC get_trip_details for passwordless / anon members
  try {
    let customUserId: string | null = null
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) {
      try { customUserId = JSON.parse(stored)?.id ?? null } catch {}
    }
    const { data: rpcData, error: rpcErr } = await supabase.rpc("get_trip_details", {
      p_trip_id: id,
      p_user_id: customUserId,
    } as never)
    if (!rpcErr && rpcData) {
      return rpcData as unknown as Trip
    }
  } catch (err) {
    console.warn("[fetchTrip rpc]", err)
  }

  return null
}
export async function createTrip(input: {
  name: string; destination: string; start_date: string; end_date: string; base_currency: string; invitee_emails?: string[]
}): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) throw new Error("Supabase not configured")
  let customUserId: string | null = null
  try {
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) customUserId = JSON.parse(stored)?.id ?? null
  } catch {}
  const { data, error } = await supabase.rpc("create_trip", {
    p_name: input.name,
    p_destination: input.destination,
    p_start_date: input.start_date,
    p_end_date: input.end_date,
    p_base_currency: input.base_currency,
    p_invitee_emails: input.invitee_emails ?? [],
    p_user_id: customUserId,
  } as never)
  if (error) throw error
  return data as string
}
export async function joinByCode(code: string): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) throw new Error("Supabase not configured")
  let customUserId: string | null = null
  try {
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) customUserId = JSON.parse(stored)?.id ?? null
  } catch {}
  const { data, error } = await supabase.rpc("join_trip_by_code", {
    p_code: code,
    p_user_id: customUserId,
  } as never)
  if (error) throw error
  return data as string
}

export type TripInvite = { id: string; code: string; created_at: string; expires_at: string; max_uses: number | null; use_count: number; revoked_at: string | null; is_active: boolean }

export async function listInvites(tripId: string): Promise<TripInvite[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  let customUserId: string | null = null
  try {
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) customUserId = JSON.parse(stored)?.id ?? null
  } catch {}
  const { data, error } = await supabase.rpc("list_trip_invites", { p_trip_id: tripId, p_user_id: customUserId } as never)
  if (error) throw error
  return (data as TripInvite[]) ?? []
}
export async function createInvite(tripId: string, expiresInDays = 30, maxUses: number | null = null) {
  const supabase = getSupabase()!
  let customUserId: string | null = null
  try {
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) customUserId = JSON.parse(stored)?.id ?? null
  } catch {}
  const { data, error } = await supabase.rpc("create_trip_invite", { p_trip_id: tripId, p_expires_in_days: expiresInDays, p_max_uses: maxUses, p_user_id: customUserId } as never)
  if (error) throw error
  return data
}
export async function revokeInvite(inviteId: string) {
  const supabase = getSupabase()!
  let customUserId: string | null = null
  try {
    const stored = localStorage.getItem("tripsplit:custom-user")
    if (stored) customUserId = JSON.parse(stored)?.id ?? null
  } catch {}
  const { error } = await supabase.rpc("revoke_trip_invite", { p_invite_id: inviteId, p_user_id: customUserId } as never)
  if (error) throw error
}
export async function resolveInvite(code: string): Promise<{ trip_id: string; trip_name: string; destination: string } | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.rpc("resolve_invite_code", { p_code: code } as never)
  if (error) return null
  const row = Array.isArray(data) ? data[0] : data
  return row ?? null
}

export async function joinWithEmailAndCode(
  email: string,
  code: string,
  name?: string
): Promise<{
  trip_id: string
  user_id: string
  email: string
  name: string
  trip_name: string
  destination: string
  base_currency: string
}> {
  const supabase = getSupabase()
  if (!supabase) {
    // In demo mode without backend
    return {
      trip_id: "demo-trip",
      user_id: "demo-user",
      email,
      name: name || email.split("@")[0] || "Traveler",
      trip_name: "Lisbon Long Weekend",
      destination: "Lisbon, Portugal",
      base_currency: "EUR",
    }
  }
  const { data, error } = await supabase.rpc("join_trip_with_email_and_code", {
    p_email: email,
    p_code: code,
    p_name: name || null,
  } as never)
  if (error) throw error
  return data as any
}
