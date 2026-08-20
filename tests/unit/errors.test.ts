import { describe, it, expect } from "vitest"
import { mapErrorCode, toUserMessage } from "@/lib/errors"

describe("error mapping", () => {
  it("maps BALANCE_CHANGED", () => {
    expect(mapErrorCode("BALANCE_CHANGED: debtor not owed")).toBe("BALANCE_CHANGED")
    expect(toUserMessage("BALANCE_CHANGED foo")).toMatch(/Balances changed/)
  })
  it("redacts UUID", () => {
    const msg = toUserMessage("error 123e4567-e89b-12d3-a456-426614174000")
    expect(msg).not.toMatch(/123e4567/)
  })
})
