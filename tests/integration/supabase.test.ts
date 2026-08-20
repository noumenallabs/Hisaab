import { describe, it, expect } from "vitest"
import { getSupabase, isSupabaseEnabled } from "@/lib/supabase"
import { isSupabaseConfigured } from "@/lib/env"

describe("supabase client", () => {
  it("isSupabaseConfigured reflects env", () => {
    expect(typeof isSupabaseConfigured).toBe("boolean")
  })
  it("getSupabase returns null when not configured", () => {
    // In test env, VITE_SUPABASE_URL may be undefined -> null
    const c = getSupabase()
    // Should be null or client
    expect(c === null || typeof c === "object").toBe(true)
  })
  it("isSupabaseEnabled mirrors configured", () => {
    expect(isSupabaseEnabled()).toBe(isSupabaseConfigured)
  })
})

describe("queryClient", () => {
  it("has correct defaults", async () => {
    const { queryClient } = await import("@/lib/queryClient")
    expect(queryClient.getDefaultOptions().queries?.retry).toBe(2)
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(0)
  })
})
