import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { getSupabase, isSupabaseEnabled } from "./supabase"
import { queryClient } from "./queryClient"
import type { Session, User } from "@supabase/supabase-js"

export type AppUser = {
  id: string; email: string; name: string; avatarUrl?: string | null
}
type AuthContextValue = {
  user: AppUser | null
  session: Session | null
  loading: boolean
  isDemo: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (name: string, email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  sendReset: (email: string) => Promise<void>
  signInWithGoogle: (returnTo?: string) => Promise<void>
  setCustomUser: (user: AppUser) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const demoKey = "tripsplit:demo-user"
const customUserKey = "tripsplit:custom-user"

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const isDemo = !isSupabaseEnabled()

  useEffect(() => {
    if (isDemo) {
      try {
        const stored = localStorage.getItem(demoKey)
        if (stored) setUser(JSON.parse(stored))
      } catch {
        /* demo signed out */
      }
      setLoading(false)
      return
    }
    const supabase = getSupabase()!
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user) {
        setUser(mapUser(data.session.user))
      } else {
        const stored = localStorage.getItem(customUserKey)
        if (stored) {
          try { setUser(JSON.parse(stored)) } catch {}
        }
      }
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (s?.user) {
        setUser(mapUser(s.user))
      } else {
        const stored = localStorage.getItem(customUserKey)
        if (stored) {
          try { setUser(JSON.parse(stored)) } catch {}
        }
      }
      setLoading(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [isDemo])

  function mapUser(u: User | null): AppUser | null {
    if (!u) return null
    const name =
      (u.user_metadata?.name as string) || u.email?.split("@")[0] || "Traveler"
    return { id: u.id, email: u.email ?? "", name }
  }

  function setCustomUser(u: AppUser) {
    localStorage.setItem(customUserKey, JSON.stringify(u))
    setUser(u)
  }

  async function signIn(email: string, password: string) {
    if (isDemo) {
      const next = {
        id: "demo-user",
        email,
        name: email.split("@")[0] || "Traveler",
      }
      localStorage.setItem(demoKey, JSON.stringify(next))
      setUser(next)
      return
    }
    const supabase = getSupabase()!
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }
  async function signUp(name: string, email: string, password: string) {
    if (isDemo) {
      const next = { id: "demo-user", email, name: name || "Traveler" }
      localStorage.setItem(demoKey, JSON.stringify(next))
      setUser(next)
      return
    }
    const supabase = getSupabase()!
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    })
    if (error) throw error
  }
  async function signOut() {
    localStorage.removeItem(customUserKey)
    if (isDemo) {
      localStorage.removeItem(demoKey)
      setUser(null)
      queryClient.clear()
      return
    }
    const supabase = getSupabase()!
    await supabase.auth.signOut()
    setUser(null)
    queryClient.clear()
  }
  async function sendReset(email: string) {
    if (isDemo) return
    const supabase = getSupabase()!
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    })
    if (error) throw error
  }
  async function signInWithGoogle(returnTo?: string) {
    if (isDemo) {
      const next = {
        id: "demo-user",
        email: "demo@google.local",
        name: "Google Demo",
      }
      localStorage.setItem(demoKey, JSON.stringify(next))
      setUser(next)
      return
    }
    const supabase = getSupabase()!
    const redirectUrl =
      window.location.origin +
      "/auth/callback" +
      (returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "")
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl },
    })
    if (error) throw error
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isDemo,
        signIn,
        signUp,
        signOut,
        sendReset,
        signInWithGoogle,
        setCustomUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const v = useContext(AuthContext)
  if (!v) throw new Error("useAuth must be used within AuthProvider")
  return v
}
