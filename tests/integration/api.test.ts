import { describe, it, expect, vi, beforeEach } from "vitest"
import * as tripsApi from "@/features/trips/api"
import * as expensesApi from "@/features/expenses/api"

const mockRpc = vi.fn()
const mockFrom = vi.fn()
vi.mock("@/lib/supabase", () => ({
  getSupabase: vi.fn()
}))

import { getSupabase } from "@/lib/supabase"

describe("trips api", () => {
  beforeEach(() => vi.clearAllMocks())
  it("fetchTrips returns [] when no supabase", async () => {
    (getSupabase as any).mockReturnValue(null)
    expect(await tripsApi.fetchTrips()).toEqual([])
  })
  it("fetchTrip returns null for non-uuid", async () => {
    (getSupabase as any).mockReturnValue({ from: vi.fn() })
    expect(await tripsApi.fetchTrip("demo")).toBeNull()
  })
  it("createTrip throws when no supabase", async () => {
    (getSupabase as any).mockReturnValue(null)
    await expect(tripsApi.createTrip({name:"a",destination:"b",start_date:"2026-08-14",end_date:"2026-08-15",base_currency:"INR"})).rejects.toThrow()
  })
  it("joinByCode calls rpc", async () => {
    const supa = { rpc: mockRpc.mockResolvedValue({ data: "uuid", error: null }) }
    ;(getSupabase as any).mockReturnValue(supa)
    const id = await tripsApi.joinByCode("CODE")
    expect(mockRpc).toHaveBeenCalledWith("join_trip_by_code", { p_code: "CODE", p_user_id: null })
    expect(id).toBe("uuid")
  })
  it("joinWithEmailAndCode calls rpc", async () => {
    const mockData = { trip_id: "t1", user_id: "u1", email: "sarah@test.com", name: "Sarah" }
    const supa = { rpc: mockRpc.mockResolvedValue({ data: mockData, error: null }) }
    ;(getSupabase as any).mockReturnValue(supa)
    const res = await tripsApi.joinWithEmailAndCode("sarah@test.com", "CODE", "Sarah")
    expect(mockRpc).toHaveBeenCalledWith("join_trip_with_email_and_code", {
      p_email: "sarah@test.com",
      p_code: "CODE",
      p_name: "Sarah"
    })
    expect(res).toEqual(mockData)
  })
  it("listInvites returns [] when no supabase", async () => {
    (getSupabase as any).mockReturnValue(null)
    expect(await tripsApi.listInvites("t1")).toEqual([])
  })
})

describe("expenses api", () => {
  it("saveExpense throws when no supabase", async () => {
    (getSupabase as any).mockReturnValue(null)
    await expect(expensesApi.saveExpense({description:"a",amountMinor:100,currency:"INR",category:"food",expenseDate:"2026-08-14",payers:[{userId:"u1",amountPaidMinor:100}],splits:[{userId:"u1",amountOwedMinor:100}],requestId:"00000000-0000-0000-0000-000000000000",tripId:"t1"} as any)).rejects.toThrow()
  })
  it("fetchExpenses returns [] when no supabase", async () => {
    (getSupabase as any).mockReturnValue(null)
    expect(await expensesApi.fetchExpenses("t1")).toEqual([])
  })
})

describe("settings and membership api", () => {
  it("addTripMember invokes add_trip_member rpc", async () => {
    const { addTripMember } = await import("@/features/settings/api")
    const supa = { rpc: mockRpc.mockResolvedValue({ data: { userId: "u2", email: "bob@test.local", name: "Bob" }, error: null }) }
    ;(getSupabase as any).mockReturnValue(supa)

    const res = await addTripMember("trip-1", "Bob@test.local", "member")
    expect(mockRpc).toHaveBeenCalledWith("add_trip_member", expect.objectContaining({
      p_trip_id: "trip-1",
      p_email: "bob@test.local",
      p_role: "member"
    }))
    expect(res).toEqual({ userId: "u2", email: "bob@test.local", name: "Bob" })
  })
})

