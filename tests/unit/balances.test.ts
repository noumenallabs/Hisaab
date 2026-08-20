import { describe, it, expect } from "vitest"
import { netBalances, simplifyDebts } from "@/features/balances/balanceMath"

describe("balances conservation", () => {
  it("sum net == 0", () => {
    const net = netBalances(
      [
        { payers: [{ userId: "a", amount: 1000 }], splits: [{ userId: "a", amount: 500 }, { userId: "b", amount: 500 }] },
        { payers: [{ userId: "b", amount: 600 }], splits: [{ userId: "a", amount: 300 }, { userId: "b", amount: 300 }] },
      ],
      [{ fromId: "b", toId: "a", amount: 200 }],
      ["a", "b"]
    )
    const sum = Object.values(net).reduce((s, v) => s + v, 0)
    expect(sum).toBe(0)
  })
  it("simplifyDebts deterministic", () => {
    const net = { a: 100, b: -100, c: 0 }
    const t1 = simplifyDebts(net)
    const t2 = simplifyDebts({ b: -100, a: 100, c: 0 })
    expect(t1).toEqual(t2)
    expect(t1[0].amount).toBe(100)
  })
})
