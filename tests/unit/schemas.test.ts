import { describe, it, expect } from "vitest"
import { expenseSchema } from "@/features/expenses/schemas"
import { tripSchema } from "@/features/trips/schemas"
import { signInSchema, signUpSchema } from "@/features/auth/schemas"

describe("tripSchema", () => {
  it("valid", () => { expect(tripSchema.safeParse({ name: "Goa", destination: "Goa", startDate: "2026-08-14", endDate: "2026-08-19", baseCurrency: "inr" }).success).toBe(true) })
  it("end before start fails", () => { expect(tripSchema.safeParse({ name: "Goa", destination: "Goa", startDate: "2026-08-19", endDate: "2026-08-14", baseCurrency: "INR" }).success).toBe(false) })
  it("currency uppercased", () => {
    const r = tripSchema.safeParse({ name: "Goa", destination: "Goa", startDate: "2026-08-14", endDate: "2026-08-19", baseCurrency: "usd" })
    expect(r.success && (r.data as any).baseCurrency).toBe("USD")
  })
})

describe("expenseSchema", () => {
  const base = {
    description: "Dinner", amountMinor: 1000, currency: "INR", category: "food" as const,
    expenseDate: "2026-08-14", payers: [{ userId: "u1", amountPaidMinor: 1000 }],
    splits: [{ userId: "u1", amountOwedMinor: 500 }, { userId: "u2", amountOwedMinor: 500 }],
    requestId: "00000000-0000-0000-0000-000000000000", tripId: "00000000-0000-0000-0000-000000000001"
  }
  it("valid", () => { expect(expenseSchema.safeParse(base).success).toBe(true) })
  it("payer sum mismatch fails", () => { expect(expenseSchema.safeParse({ ...base, payers: [{ userId: "u1", amountPaidMinor: 500 }] }).success).toBe(false) })
  it("split sum mismatch fails", () => { expect(expenseSchema.safeParse({ ...base, splits: [{ userId: "u1", amountOwedMinor: 100 }] }).success).toBe(false) })
})

describe("auth schemas", () => {
  it("signIn valid", () => { expect(signInSchema.safeParse({ email: "a@b.com", password: "12345678" }).success).toBe(true) })
  it("signUp password mismatch fails", () => { expect(signUpSchema.safeParse({ name: "Arun", email: "a@b.com", password: "12345678", confirm: "wrong" }).success).toBe(false) })
})
