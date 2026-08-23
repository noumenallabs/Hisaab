import { Link, useSearchParams } from "react-router"
import { Mail, ArrowLeft } from "lucide-react"
import { getSupabase } from "@/lib/supabase"
import { validateReturnTo } from "@/app/routes"
import { AuthShell } from "@/components/navigation/AuthShell"

import { useState } from "react"

export function VerifyEmailPage() {
  const [search] = useSearchParams()
  const rawRet = search.get("returnTo")
  const ret = rawRet ? validateReturnTo(rawRet) : null
  const [resent, setResent] = useState(false)
  const [sending, setSending] = useState(false)

  async function resend() {
    const supabase = getSupabase()
    if (!supabase) return
    try {
      setSending(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.email) {
        const redirectUrl =
          window.location.origin +
          "/auth/callback" +
          (ret ? `?returnTo=${encodeURIComponent(ret)}` : "")
        await supabase.auth.resend({
          type: "signup",
          email: user.email,
          options: {
            emailRedirectTo: redirectUrl,
          },
        })
        setResent(true)
      }
    } catch {} finally {
      setSending(false)
    }
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
        {resent && (
          <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            ✓ Confirmation email resent!
          </p>
        )}
        <button
          onClick={resend}
          disabled={sending || resent}
          className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl border border-hair bg-surface px-5 text-xs font-bold text-ink hover:bg-canvas transition-colors disabled:opacity-50"
        >
          {sending ? "Sending…" : resent ? "Email sent" : "Resend email"}
        </button>
        <p className="mt-6 text-xs">
          <Link
            to={ret ? `/sign-in?returnTo=${encodeURIComponent(ret)}` : "/sign-in"}
            className="inline-flex items-center gap-1.5 font-semibold text-brand hover:underline"
          >
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  )
}
