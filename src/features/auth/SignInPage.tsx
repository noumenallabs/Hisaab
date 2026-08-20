import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signInSchema } from "./schemas"
import { z } from "zod"
import { Link, useNavigate, useSearchParams } from "react-router"
import { useAuth } from "@/lib/auth"
import { Compass, Mail, LockKeyhole, ArrowRight } from "lucide-react"
import { useState } from "react"

type Form = z.infer<typeof signInSchema>

import { AuthShell } from "@/components/navigation/AuthShell"

export function SignInPage() {
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const rawRet = search.get("returnTo") || "/trips"
  function safeReturnTo(to: string): string { try { const u = new URL(to, window.location.origin); if (u.origin !== window.location.origin) return "/trips"; if (!u.pathname.startsWith("/")) return "/trips"; return u.pathname + u.search + u.hash } catch { return "/trips" } }
  const ret = safeReturnTo(rawRet)
  const [err, setErr] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(signInSchema) })
  async function onSubmit(v: Form) {
    try {
      setErr(null)
      await signIn(v.email, v.password)
      navigate(ret)
    } catch (e: any) {
      const msg = String(e.message ?? e)
      if (msg.includes("Invalid login") || msg.includes("invalid_credentials")) setErr("Invalid email or password.")
      else setErr(msg)
    }
  }
  return (
    <AuthShell title="Sign in" subtitle="Welcome back. Access your trips, balances, and shared expenses.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Email Address
          <div className="relative mt-1.5">
            <Mail className="absolute left-3.5 top-3.5 text-ink-faint" size={17} />
            <input
              {...register("email")}
              className="w-full min-h-11 rounded-xl border border-hair bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="you@example.com"
            />
          </div>
          {errors.email && (
            <span className="text-xs text-owe font-semibold">{errors.email.message}</span>
          )}
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Password
          <div className="relative mt-1.5">
            <LockKeyhole
              className="absolute left-3.5 top-3.5 text-ink-faint"
              size={17}
            />
            <input
              type="password"
              {...register("password")}
              className="w-full min-h-11 rounded-xl border border-hair bg-surface py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
          {errors.password && (
            <span className="text-xs text-owe font-semibold">{errors.password.message}</span>
          )}
        </label>
        {err && <p role="alert" className="rounded-xl bg-owe-soft p-3 text-xs font-semibold text-owe border border-owe/20">{err}</p>}
        <button
          disabled={isSubmitting}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Sign in <ArrowRight size={17} />
        </button>
        <div className="my-4 flex items-center gap-3 text-[10px] font-semibold tracking-wider text-ink-faint before:h-px before:flex-1 before:bg-hair after:h-px after:flex-1 after:bg-hair">
          OR
        </div>
        <button
          type="button"
          aria-label="Continue with Google"
          onClick={async () => {
            try { await signInWithGoogle(ret) } catch (e: any) { setErr(e.message) }
          }}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-hair text-sm font-semibold hover:bg-canvas transition-colors"
        >
          Continue with Google
        </button>

        <p className="text-center text-xs">
          <Link to="/forgot-password" className="font-semibold text-brand hover:underline">
            Forgot password?
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
