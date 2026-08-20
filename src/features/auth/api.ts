import { getSupabase } from "@/lib/supabase"

export async function signIn(email: string, password: string) {
  const supabase = getSupabase()!
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}
export async function signUp(name: string, email: string, password: string) {
  const supabase = getSupabase()!
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  })
  if (error) throw error
}
export async function signInWithGoogle() {
  const supabase = getSupabase()!
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/auth/callback" },
  })
  if (error) throw error
}
