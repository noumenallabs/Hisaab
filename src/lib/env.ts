import { z } from "zod"

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
})

type Env = z.infer<typeof envSchema>

function readEnv(): Env {
  const raw = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    VITE_SUPABASE_ANON_KEY: import.meta.env
      .VITE_SUPABASE_ANON_KEY as string | undefined,
  }
  const parsed = envSchema.safeParse(raw)
  if (!parsed.success) {
    console.warn("[env] invalid Supabase env", parsed.error.flatten())
    return raw
  }
  return parsed.data
}

export const env = readEnv()

export const isSupabaseConfigured = Boolean(
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY,
)

export function requireEnv(): void {
  if (!isSupabaseConfigured)
    throw new Error(
      "Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
    )
}
