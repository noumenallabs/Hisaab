import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env, isSupabaseConfigured } from "./env"
import type { Database } from "@/types/database"

let client: SupabaseClient<Database> | null = null

export function getSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null
  if (client) return client
  client = createClient<Database>(
    env.VITE_SUPABASE_URL!,
    env.VITE_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  )
  return client
}

export function isSupabaseEnabled(): boolean {
  return isSupabaseConfigured
}
