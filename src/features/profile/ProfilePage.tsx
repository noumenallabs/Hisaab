import { useAuth } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { isSupabaseConfigured } from "@/lib/env"
import { toUserMessage } from "@/lib/errors"

import { Link } from "react-router"
import { ArrowLeft } from "lucide-react"

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Name must be 60 characters or fewer"),
})

type ProfileForm = z.infer<typeof profileSchema>

export function ProfilePage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [msg, setMsg] = useState<{ text: string; kind: "success" | "error" | "info" } | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: (user as any)?.name ?? "" },
  })

  async function onSubmit(v: ProfileForm) {
    const supabase = getSupabase()
    if (!supabase || !isSupabaseConfigured) {
      setMsg({ text: "Demo mode — profile is local.", kind: "info" })
      return
    }
    const { error } = await supabase.rpc("update_profile", {
      p_name: v.name.trim(),
    } as never)
    if (error) setMsg({ text: toUserMessage(error.message), kind: "error" })
    else {
      setMsg({ text: "Profile updated successfully.", kind: "success" })
      try {
        await supabase.auth.getUser()
      } catch {}
      qc.invalidateQueries({ queryKey: ["profile"] })
      qc.invalidateQueries({ queryKey: ["profiles"] })
      qc.invalidateQueries({ queryKey: ["isAdmin"] })
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link
        to="/trips"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
      >
        <ArrowLeft size={14} /> Back to trips
      </Link>
      <div className="rounded-2xl border border-hair bg-surface p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-4 border-b border-hair pb-6">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white shadow-sm">
            {(user?.name ?? "?")[0].toUpperCase()}
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">{user?.name}</h1>
            <p className="text-xs text-ink-soft">{user?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
            Display Name
            <input
              {...register("name")}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              maxLength={60}
              placeholder="Your name"
              className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand aria-[invalid=true]:border-owe"
            />
            {errors.name && (
              <p id="name-error" role="alert" className="mt-1 text-xs font-semibold text-owe">
                {errors.name.message}
              </p>
            )}
          </label>

          <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
            Email Address
            <input
              value={(user as any)?.email ?? ""}
              disabled
              readOnly
              className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-canvas px-3 py-2 text-sm text-ink-soft cursor-not-allowed"
              aria-label="Email (read-only)"
            />
            <span className="mt-1 block text-[11px] text-ink-faint">Account email cannot be modified directly</span>
          </label>

          {msg && (
            <p
              role={msg.kind === "error" ? "alert" : "status"}
              aria-live="polite"
              className={`rounded-xl p-3 text-xs font-semibold ${
                msg.kind === "error"
                  ? "bg-red-50 text-owe border border-red-200"
                  : msg.kind === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  : "bg-canvas text-ink-soft border border-hair"
              }`}
            >
              {msg.text}
            </p>
          )}

          <button
            disabled={isSubmitting}
            className="flex min-h-11 w-full items-center justify-center rounded-xl bg-brand text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? "Saving changes…" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  )
}
