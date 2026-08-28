import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SettlementDialog } from "@/features/balances/SettlementDialog"

const mockRpc = vi.fn()
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: mockRpc,
    auth: { getSession: vi.fn(), getUser: vi.fn() },
  }),
}))

describe("SettlementDialog Interactive Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: { id: "settle-1" }, error: null })
  })

  it("renders outstanding amount and pre-fills full outstanding amount", () => {
    render(
      <SettlementDialog
        open={true}
        onClose={vi.fn()}
        tripId="t1"
        fromId="u1"
        toId="u2"
        fromName="Alice"
        toName="Bob"
        outstandingMinor={5000} // ₹50.00
        currency="INR"
      />
    )

    expect(screen.getByRole("dialog", { name: /Record settlement/i })).toBeInTheDocument()
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("Bob")).toBeInTheDocument()
    expect(screen.getAllByText(/Outstanding ₹50\.00/i).length).toBeGreaterThan(0)

    const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
    expect(amountInput.value).toBe("50")
  })

  it("validates overpayment and reactively clears error on keystroke change", async () => {
    const user = userEvent.setup()
    render(
      <SettlementDialog
        open={true}
        onClose={vi.fn()}
        tripId="t1"
        fromId="u1"
        toId="u2"
        fromName="Alice"
        toName="Bob"
        outstandingMinor={5000} // ₹50.00
        currency="INR"
      />
    )

    const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
    const confirmBtn = screen.getByRole("button", { name: /Confirm/i })

    // Try overpaying: enter 100.00 (which exceeds 50.00)
    await user.clear(amountInput)
    await user.type(amountInput, "100.00")
    await user.click(confirmBtn)

    expect(await screen.findByText(/exceeds outstanding/i)).toBeInTheDocument()

    // Type a partial valid amount: 25.00
    await user.clear(amountInput)
    await user.type(amountInput, "25.00")

    // Error should be cleared reactively
    expect(screen.queryByText(/exceeds outstanding/i)).not.toBeInTheDocument()
  })

  it("clicking 'Full amount' button restores full outstanding value and clears errors", async () => {
    const user = userEvent.setup()
    render(
      <SettlementDialog
        open={true}
        onClose={vi.fn()}
        tripId="t1"
        fromId="u1"
        toId="u2"
        fromName="Alice"
        toName="Bob"
        outstandingMinor={7500} // ₹75.00
        currency="INR"
      />
    )

    const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
    const confirmBtn = screen.getByRole("button", { name: /Confirm/i })

    // Trigger error
    await user.clear(amountInput)
    await user.type(amountInput, "200.00")
    await user.click(confirmBtn)
    expect(await screen.findByText(/exceeds outstanding/i)).toBeInTheDocument()

    // Click full amount button
    const fullBtn = screen.getByRole("button", { name: /Full amount: ₹75\.00/i })
    await user.click(fullBtn)

    expect(amountInput.value).toBe("75")
    expect(screen.queryByText(/exceeds outstanding/i)).not.toBeInTheDocument()
  })

  it("handles 0-decimal JPY currency correctly without decimal points", async () => {
    const user = userEvent.setup()
    render(
      <SettlementDialog
        open={true}
        onClose={vi.fn()}
        tripId="t1"
        fromId="u1"
        toId="u2"
        fromName="Kenji"
        toName="Yuki"
        outstandingMinor={12000} // ¥12,000
        currency="JPY"
      />
    )

    expect(screen.getAllByText(/Outstanding ¥12,000/i).length).toBeGreaterThan(0)

    const amountInput = screen.getByLabelText(/Amount \(JPY\)/i) as HTMLInputElement
    expect(amountInput.value).toBe("12000")

    // Type partial amount
    await user.clear(amountInput)
    await user.type(amountInput, "6000")

    expect(screen.getByText(/Recording ¥6,000/i)).toBeInTheDocument()
  })

  it("submits settlement successfully and invokes onSuccess and onClose", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSuccess = vi.fn()

    render(
      <SettlementDialog
        open={true}
        onClose={onClose}
        onSuccess={onSuccess}
        tripId="t_goa"
        fromId="u_sneha"
        toId="u_arun"
        fromName="Sneha"
        toName="Arun"
        outstandingMinor={5000}
        currency="INR"
      />
    )

    // Select payment method Cash
    const methodSelect = screen.getByLabelText(/Payment Method/i)
    await user.selectOptions(methodSelect, "Cash")

    // Enter reference and note
    const refInput = screen.getByLabelText(/REFERENCE/i)
    await user.type(refInput, "HAND-CASH-123")

    const noteInput = screen.getByLabelText(/NOTE/i)
    await user.type(noteInput, "Settled at dinner")

    const confirmBtn = screen.getByRole("button", { name: /Confirm ₹50\.00/i })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith("record_settlement", {
        p_payload: expect.objectContaining({
          tripId: "t_goa",
          fromUserId: "u_sneha",
          toUserId: "u_arun",
          amountMinor: 5000,
          paymentMethod: "Cash",
          reference: "HAND-CASH-123",
          note: "Settled at dinner",
        }),
      })
      expect(onSuccess).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it("closes modal dialog when Escape key is pressed", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <SettlementDialog
        open={true}
        onClose={onClose}
        tripId="t1"
        fromId="u1"
        toId="u2"
        outstandingMinor={1000}
      />
    )

    await user.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalled()
  })
})
