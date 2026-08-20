import { Link, useSearchParams } from "react-router"
import { Mail } from "lucide-react"
import { getSupabase } from "@/lib/supabase"
import { validateReturnTo } from "@/app/routes"
import { AuthShell } from "@/components/navigation/AuthShell"

export function VerifyEmailPage() {
  const [search] = useSearchParams()
  const rawRet = search.get("returnTo")
  const ret = rawRet ? validateReturnTo(rawRet) : null

  async function resend() {
    const supabase = getSupabase()
    if (!supabase) return
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.email)
      await supabase.auth.resend({ type: "signup", email: user.email })
  }
  return (
    <AuthShell
      title="Verify your email"
      subtitle="We sent a confirmation link to your inbox. Click it to activate your account."
      backTo={ret ? `/sign-in?returnTo=${encodeURIComponent(ret)}` : "/sign-in"}
      backLabel="Back to sign in"
      showTabs={false}
    >
      <div className="py-4 text-center">
        <Mail className="mx-auto text-brand" size={44} />
        <p className="mt-4 text-xs leading-5 text-ink-soft">
          Didn’t receive the confirmation email? Check your spam folder or trigger a fresh email.
        </p>
        <button
          onClick={resend}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-hair bg-surface px-5 text-xs font-bold text-ink hover:bg-canvas transition-colors"
        >
          Resend email
        </button>
        <p className="mt-6 text-xs">
          <Link
            to={ret ? `/sign-in?returnTo=${encodeURIComponent(ret)}` : "/sign-in"}
            className="font-semibold text-brand hover:underline"
          >
            ← Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
