import { useAuth } from "@/lib/auth"
import { useTheme } from "@/lib/theme"
import { getSupabase } from "@/lib/supabase"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useState, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { isSupabaseConfigured } from "@/lib/env"
import { toUserMessage } from "@/lib/errors"

import { Link } from "react-router"
import { ArrowLeft } from "lucide-react"
import { UserAvatar } from "@/components/feedback/UserAvatar"

const profileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60, "Name must be 60 characters or fewer"),
})

type ProfileForm = z.infer<typeof profileSchema>

export function ProfilePage() {
  const { user, setCustomUser } = useAuth()
  const { theme, setTheme } = useTheme()
  const qc = useQueryClient()
  const [msg, setMsg] = useState<{ text: string; kind: "success" | "error" | "info" } | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: (user as any)?.name ?? "" },
  })

  // Sync when user finishes loading
  useEffect(() => {
    if (user?.name) {
      reset({ name: user.name })
    }
  }, [user?.name, reset])

  async function onSubmit(v: ProfileForm) {
    const supabase = getSupabase()
    if (!supabase || !isSupabaseConfigured) {
      if (user) setCustomUser({ ...user, name: v.name.trim() })
      setMsg({ text: "Profile updated.", kind: "success" })
      return
    }
    const { error } = await supabase.rpc("update_profile", {
      p_name: v.name.trim(),
      p_user_id: user?.id ?? null,
    } as never)
    if (error) setMsg({ text: toUserMessage(error.message), kind: "error" })
    else {
      if (user) setCustomUser({ ...user, name: v.name.trim() })
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
    <div className="space-y-6 max-w-2xl mx-auto">
      <Link
        to="/trips"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
      >
        <ArrowLeft size={14} /> Back to trips
      </Link>
      <div className="rounded-2xl border border-hair bg-surface p-6 sm:p-8 shadow-xs">
        <div className="flex items-center gap-4 border-b border-hair pb-6">
          <UserAvatar
            id={user?.id}
            name={user?.name ?? "?"}
            isCurrentUser
            size="xl"
          />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">{user?.name}</h1>
            <p className="text-xs text-ink-soft">{user?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
            Display Name
            <input
              {...register("name", {
                onChange: () => {
                  if (msg) setMsg(null)
                },
              })}
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

          {/* Appearance Section */}
          <div className="pt-2">
            <span className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
              Appearance & Theme
            </span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTheme("system")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-bold transition-all ${
                  theme === "system"
                    ? "border-brand bg-brand/10 text-brand shadow-xs"
                    : "border-hair bg-surface text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                <span className="text-base">💻</span>
                <span>System</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-bold transition-all ${
                  theme === "light"
                    ? "border-brand bg-brand/10 text-brand shadow-xs"
                    : "border-hair bg-surface text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                <span className="text-base">☀️</span>
                <span>Light</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-bold transition-all ${
                  theme === "dark"
                    ? "border-brand bg-brand/10 text-brand shadow-xs"
                    : "border-hair bg-surface text-ink-soft hover:bg-canvas hover:text-ink"
                }`}
              >
                <span className="text-base">🌙</span>
                <span>Dark</span>
              </button>
            </div>
          </div>

          {msg && (
            <p
              role={msg.kind === "error" ? "alert" : "status"}
              aria-live="polite"
              className={`rounded-xl p-3 text-xs font-semibold ${
                msg.kind === "error"
                  ? "border border-red-200 bg-red-50 text-owe dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300"
                  : msg.kind === "success"
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "border border-hair bg-canvas text-ink-soft"
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
