import { useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { getSupabase } from "@/lib/supabase"
import { validateReturnTo } from "@/app/routes"

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const ret = validateReturnTo(search.get("returnTo"))

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      navigate(ret)
      return
    }
    supabase.auth.getSession().then(() => navigate(ret))
  }, [navigate, ret])

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-canvas">
      <p className="text-sm text-ink-soft">Completing sign-in…</p>
    </main>
  )
}
