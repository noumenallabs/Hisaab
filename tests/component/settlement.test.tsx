import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SettlementDialog } from "@/features/balances/SettlementDialog"

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: vi.fn().mockResolvedValue({ data: { id: "s1" }, error: null }),
    auth: { getSession: vi.fn() }
  })
}))

describe("SettlementDialog", () => {
  it("renders outstanding and validates overpayment", async () => {
    const user=userEvent.setup()
    render(<SettlementDialog open tripId="t1" fromId="u1" toId="u2" outstandingMinor={500} onClose={vi.fn()} />)
    expect(screen.getAllByText(/Outstanding/).length).toBeGreaterThan(0)
    // Try to enter overpayment
    const amount=screen.getByLabelText(/AMOUNT/i) as HTMLInputElement
    await user.clear(amount)
    await user.type(amount,"1000")
    await user.click(screen.getByText(/Confirm/))
    expect(await screen.findByText(/exceeds outstanding/)).toBeInTheDocument()
  })
  it("closed when open false renders nothing", () => {
    const { container } = render(<SettlementDialog open={false} tripId="t1" fromId="u1" toId="u2" outstandingMinor={100} onClose={vi.fn()} />)
    expect(container.innerHTML).toBe("")
  })
})
