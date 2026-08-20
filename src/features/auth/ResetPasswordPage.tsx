import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { Link, useNavigate } from "react-router"
import { LockKeyhole, ArrowRight } from "lucide-react"
import { getSupabase } from "@/lib/supabase"
import { useState } from "react"
import { AuthShell } from "@/components/navigation/AuthShell"

const schema = z
  .object({ password: z.string().min(8), confirm: z.string().min(8) })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords must match",
  })
type Form = z.infer<typeof schema>

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })
  async function onSubmit(v: Form) {
    try {
      const supabase = getSupabase()
      if (!supabase) throw new Error("Supabase not configured")
      const { error } = await supabase.auth.updateUser({ password: v.password })
      if (error) throw error
      navigate("/sign-in")
    } catch (e: any) {
      setErr(e.message)
    }
  }
  return (
    <AuthShell
      title="Set a new password"
      subtitle="Enter your new password below to secure your account."
      backTo="/sign-in"
      backLabel="Back to sign in"
      showTabs={false}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          New Password
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
          Update password <ArrowRight size={17} />
        </button>
      </form>
    </AuthShell>
  )
}
