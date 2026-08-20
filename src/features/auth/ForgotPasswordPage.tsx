import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { resetSchema } from "./schemas"
import { z } from "zod"
import { Link } from "react-router"
import { useAuth } from "@/lib/auth"
import { Compass, Mail, ArrowRight, CheckCircle2 } from "lucide-react"
import { useState } from "react"

type Form = z.infer<typeof resetSchema>

import { AuthShell } from "@/components/navigation/AuthShell"

export function ForgotPasswordPage() {
  const { sendReset } = useAuth()
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState("")
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(resetSchema) })
  async function onSubmit(v: Form) {
    await sendReset(v.email)
    setEmail(v.email)
    setSent(true)
  }
  return (
    <AuthShell
      title="Reset your password"
      subtitle="We’ll send a secure password reset link to your email address."
      backTo="/sign-in"
      backLabel="Back to sign in"
      showTabs={false}
    >
      {sent ? (
        <div className="py-4 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={44} />
          <h2 className="mt-4 text-lg font-bold text-ink">Check your inbox</h2>
          <p className="mt-2 text-xs leading-5 text-ink-soft">
            If an account exists for <b className="text-ink">{email}</b>, a password reset link has been dispatched.
          </p>
          <Link
            className="mt-6 inline-flex min-h-10 items-center justify-center rounded-xl bg-brand px-5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
            to="/sign-in"
          >
            Return to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              <span className="text-xs text-owe font-semibold">
                {errors.email.message}
              </span>
            )}
          </label>
          <button
            disabled={isSubmitting}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            Email reset link <ArrowRight size={17} />
          </button>
          <p className="text-center text-xs">
            <Link to="/sign-in" className="font-semibold text-brand hover:underline">
              ← Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
