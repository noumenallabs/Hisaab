import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { signUpSchema } from "./schemas"
import { z } from "zod"
import { Link, useNavigate, useSearchParams } from "react-router"
import { useAuth } from "@/lib/auth"
import { Compass, Mail, LockKeyhole, ArrowRight } from "lucide-react"
import { useState } from "react"
import { validateReturnTo } from "@/app/routes"

type Form = z.infer<typeof signUpSchema>

import { AuthShell } from "@/components/navigation/AuthShell"

export function SignUpPage() {
  const { signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const rawRet = search.get("returnTo")
  const ret = rawRet ? validateReturnTo(rawRet) : null
  const [err, setErr] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(signUpSchema) })
  async function onSubmit(v: Form) {
    try {
      setErr(null)
      await signUp(v.name, v.email, v.password, ret ?? undefined)
      navigate(ret ? `/verify-email?returnTo=${encodeURIComponent(ret)}` : "/verify-email")
    } catch (e: any) {
      setErr(e.message)
    }
  }
  return (
    <AuthShell title="Create account" subtitle="Join Hissaab to track shared expenses, balances, and settlements.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Your Name
          <input
            {...register("name")}
            className="mt-1.5 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            placeholder="e.g. Arun"
          />
          {errors.name && (
            <span className="text-xs text-owe font-semibold">{errors.name.message}</span>
          )}
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Email Address
          <div className="relative mt-1.5">
            <Mail
              className="absolute left-3.5 top-3.5 text-ink-faint"
              size={17}
            />
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
            <span className="text-xs text-owe font-semibold">
              {errors.password.message}
            </span>
          )}
        </label>
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Confirm Password
          <input
            type="password"
            {...register("confirm")}
            className="mt-1.5 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          {errors.confirm && (
            <span className="text-xs text-owe font-semibold">{errors.confirm.message}</span>
          )}
        </label>
        {err && <p role="alert" className="rounded-xl bg-owe-soft p-3 text-xs font-semibold text-owe border border-owe/20">{err}</p>}
        <button
          disabled={isSubmitting}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Create account <ArrowRight size={17} />
        </button>
        <button
          type="button"
          onClick={() => signInWithGoogle(ret ?? undefined)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-hair text-sm font-semibold hover:bg-canvas transition-colors"
        >
          Continue with Google
        </button>
      </form>
    </AuthShell>
  )
}
