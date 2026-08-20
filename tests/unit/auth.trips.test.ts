import { describe, it, expect } from "vitest"
import { tripSchema } from "@/features/trips/schemas"
import { signInSchema, signUpSchema, resetSchema } from "@/features/auth/schemas"

describe("auth trip schemas exhaustive", () => {
  it("trip name trimmed", () => {
    const r=tripSchema.safeParse({name:"  Goa  ",destination:"Goa",startDate:"2026-08-14",endDate:"2026-08-15",baseCurrency:"INR"})
    expect(r.success && (r.data as any).name).toBe("Goa")
  })
  it("trip name too long", () => { expect(tripSchema.safeParse({name:"a".repeat(101),destination:"Goa",startDate:"2026-08-14",endDate:"2026-08-15",baseCurrency:"INR"}).success).toBe(false) })
  it("destination too long", () => { expect(tripSchema.safeParse({name:"Goa",destination:"a".repeat(121),startDate:"2026-08-14",endDate:"2026-08-15",baseCurrency:"INR"}).success).toBe(false) })
  it("signIn email invalid", () => { expect(signInSchema.safeParse({email:"notemail",password:"12345678"}).success).toBe(false) })
  it("signIn password short", () => { expect(signInSchema.safeParse({email:"a@b.com",password:"short"}).success).toBe(false) })
  it("signUp name empty fails", () => { expect(signUpSchema.safeParse({name:"",email:"a@b.com",password:"12345678",confirm:"12345678"}).success).toBe(false) })
  it("resetSchema valid", () => { expect(resetSchema.safeParse({email:"a@b.com"}).success).toBe(true) })
  it("resetSchema invalid", () => { expect(resetSchema.safeParse({email:"bad"}).success).toBe(false) })
})

describe("isAdminEmail logic", () => {
  it("allowlist parsing", async () => {
    const { isAdminEmail } = await import("@/lib/useAdmin")
    // Without env, should be false
    expect(isAdminEmail("test@example.com")).toBe(false)
  })
})

