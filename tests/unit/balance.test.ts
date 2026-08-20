import { describe, it, expect } from "vitest"
import { netBalances, simplifyDebts, tripNetMinor } from "@/features/balances/balanceMath"

describe("netBalances", () => {
  it("conservation sum zero", () => {
    const expenses = [
      { payers: [{ userId: "a", amount: 1000 }], splits: [{ userId: "a", amount: 500 }, { userId: "b", amount: 500 }] },
      { payers: [{ userId: "b", amount: 300 }], splits: [{ userId: "a", amount: 150 }, { userId: "b", amount: 150 }] },
    ]
    const settlements = [{ fromId: "b", toId: "a", amount: 100 }]
    const net = netBalances(expenses, settlements, ["a", "b"])
    expect(Object.values(net).reduce((s, v) => s + v, 0)).toBe(0)
  })
  it("deleted expenses ignored", () => {
    const net = netBalances(
      [{ payers: [{ userId: "a", amount: 100 }], splits: [{ userId: "a", amount: 100 }], deleted: true }],
      [], ["a"]
    )
    expect(net["a"]).toBe(0)
  })
  it("per-expense contribution", () => {
    const net = netBalances(
      [{ payers: [{ userId: "a", amount: 1000 }], splits: [{ userId: "b", amount: 1000 }] }],
      [], ["a", "b"]
    )
    expect(net["a"]).toBe(1000)
    expect(net["b"]).toBe(-1000)
  })
})

describe("simplifyDebts", () => {
  it("deterministic with ties (userId tie-break)", () => {
    const net = { "u_a": 500, "u_b": 500, "u_c": -500, "u_d": -500 }
    const t1 = simplifyDebts(net)
    const t2 = simplifyDebts({ "u_b": 500, "u_a": 500, "u_d": -500, "u_c": -500 })
    // Should be deterministic regardless of input order due to sorting
    expect(t1).toEqual(t2)
    // Sorted creditors a then b, debtors c then d -> transfers a<-c, b<-d or similar deterministic
    expect(t1.length).toBe(2)
  })
  it("single debtor creditor", () => {
    const t = simplifyDebts({ a: -100, b: 100 })
    expect(t).toEqual([{ fromId: "a", toId: "b", amount: 100 }])
  })
  it("zero net no transfers", () => { expect(simplifyDebts({ a: 0, b: 0 })).toEqual([]) })
  it("current user per-expense", () => {
    const net = netBalances([{ payers: [{ userId: "a", amount: 200 }], splits: [{ userId: "a", amount: 100 }, { userId: "b", amount: 100 }] }], [], ["a", "b"])
    expect(net["a"]).toBe(100) // a paid 200 owed 100
    expect(net["b"]).toBe(-100)
  })
})

describe("tripNetMinor", () => {
  it("maps balances", () => {
    expect(tripNetMinor([{ user_id: "x", net_minor: 123 }])).toEqual({ x: 123 })
  })
})

describe("audit diff normalization (client-side)", () => {
  it("changed_fields sorted", () => {
    const prev = { description: "A", amount_minor: 100 }
    const next = { description: "B", amount_minor: 200 }
    const changed = Object.keys(prev).filter(k => (prev as any)[k] !== (next as any)[k]).sort()
    expect(changed).toEqual(["amount_minor", "description"])
  })
  it("child arrays sorted by userId", () => {
    const payers = [{ userId: "u_b", amount: 100 }, { userId: "u_a", amount: 200 }]
    const sorted = [...payers].sort((a, b) => a.userId.localeCompare(b.userId))
    expect(sorted[0].userId).toBe("u_a")
  })
})
