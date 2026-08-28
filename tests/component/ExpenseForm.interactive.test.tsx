import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ExpenseFormPage } from "@/features/expenses/ExpenseFormPage"

const mockMembers = [
  { user_id: "u1", name: "Alice", email: "alice@test.com", role: "owner" },
  { user_id: "u2", name: "Bob", email: "bob@test.com", role: "member" },
  { user_id: "u3", name: "Charlie", email: "charlie@test.com", role: "member" },
]

let mockTripCurrency = "INR"
const mockMutateAsync = vi.fn().mockResolvedValue({ id: "exp-1" })

vi.mock("@/features/trips/useMembers", () => ({
  useTripMembers: () => ({
    data: mockMembers,
    isLoading: false,
  }),
}))

vi.mock("@/features/trips/hooks", () => ({
  useTrip: () => ({
    data: {
      id: "trip-1",
      name: "Test Trip",
      base_currency: mockTripCurrency,
      status: "active",
    },
    isLoading: false,
  }),
}))

vi.mock("@/features/expenses/hooks", () => ({
  useSaveExpense: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
  useExpense: () => ({
    data: null,
    isLoading: false,
  }),
}))

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: vi.fn().mockResolvedValue({ data: { id: "exp-1" }, error: null }),
  }),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Alice", email: "alice@test.com" },
    setCustomUser: vi.fn(),
  }),
}))

function renderExpenseForm(initialRoute = "/trips/trip-1/expenses/new") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/trips/:tripId/expenses/new" element={<ExpenseFormPage />} />
          <Route path="/trips/:tripId/expenses" element={<div>Expenses List Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("ExpenseFormPage Interactive & State Machine Tests", () => {
  beforeEach(() => {
    mockTripCurrency = "INR"
    mockMutateAsync.mockClear()
    localStorage.clear()
  })

  // 1. Currency initialization tests
  it("initializes with 2-decimal currency default ('10.00') for INR", async () => {
    mockTripCurrency = "INR"
    renderExpenseForm()

    const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
    expect(amountInput.value).toBe("10.00")
    expect(screen.getByText(/Total ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
    expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
  })

  it("initializes with 0-decimal currency default ('10') for JPY", async () => {
    mockTripCurrency = "JPY"
    renderExpenseForm()

    const amountInput = screen.getByLabelText(/Amount \(JPY\)/i) as HTMLInputElement
    expect(amountInput.value).toBe("10")
    expect(screen.getByText(/Total ¥10 \/ ¥10/i)).toBeInTheDocument()
    expect(screen.getByText(/Allocated ¥10 \/ ¥10/i)).toBeInTheDocument()
  })

  // 2. Keystroke typing and reactive error clearance
  it("clears description validation error reactively upon typing valid description", async () => {
    const user = userEvent.setup()
    renderExpenseForm()

    const descInput = screen.getByLabelText(/Description/i)
    const submitBtn = screen.getByRole("button", { name: /^save expense$/i })

    // Submit with empty description to trigger validation error
    await user.click(submitBtn)
    expect(await screen.findByText(/String must contain at least 1 character\(s\)|Description is required/i)).toBeInTheDocument()

    // Type in description field
    await user.type(descInput, "Dinner with team")

    // Error should immediately disappear
    await waitFor(() => {
      expect(screen.queryByText(/String must contain at least 1 character\(s\)|Description is required/i)).not.toBeInTheDocument()
    })
  })

  it("updates single payer and split allocations reactively when amount changes", async () => {
    const user = userEvent.setup()
    renderExpenseForm()

    const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
    await user.clear(amountInput)
    await user.type(amountInput, "60.00")

    // Check that total payer and allocated split are updated to ₹60.00
    await waitFor(() => {
      expect(screen.getByText(/Total ₹60\.00 \/ ₹60\.00/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ₹60\.00 \/ ₹60\.00/i)).toBeInTheDocument()
      expect(screen.getByText(/₹20\.00 \/ person/i)).toBeInTheDocument()
    })
  })

  // 3. Dynamic split mode switching
  it("switching split modes immediately initializes valid allocations without errors", async () => {
    const user = userEvent.setup()
    renderExpenseForm()

    // Switch to shares mode
    const sharesBtn = screen.getByRole("button", { name: /^shares$/i })
    await user.click(sharesBtn)

    expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
    expect(screen.queryByText(/Split sum must equal total/i)).not.toBeInTheDocument()

    // Switch to percent mode
    const percentBtn = screen.getByRole("button", { name: /^percent$/i })
    await user.click(percentBtn)

    expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
    expect(screen.queryByText(/Split sum must equal total/i)).not.toBeInTheDocument()

    // Switch to exact mode
    const exactBtn = screen.getByRole("button", { name: /^exact$/i })
    await user.click(exactBtn)

    expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
    expect(screen.queryByText(/Split sum must equal total/i)).not.toBeInTheDocument()

    // Switch back to equal mode
    const equalBtn = screen.getByRole("button", { name: /^equal$/i })
    await user.click(equalBtn)

    expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
    expect(screen.getByText(/₹3\.33 \/ person/i)).toBeInTheDocument()
  })

  // 4. Exact split mode interactive editing
  it("exact split mode: typing individual amounts updates total allocated and clears errors when balanced", async () => {
    const user = userEvent.setup()
    renderExpenseForm()

    const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
    await user.clear(amountInput)
    await user.type(amountInput, "30.00")

    // Switch to exact mode
    await user.click(screen.getByRole("button", { name: /^exact$/i }))

    // Change Alice exact to 15, Bob to 10, Charlie to 5 (sum = 30.00)
    const split0 = screen.getByRole("textbox", { name: "Alice" })
    await user.clear(split0)
    await user.type(split0, "15")

    const split1 = screen.getByRole("textbox", { name: "Bob" })
    await user.clear(split1)
    await user.type(split1, "10")

    const split2 = screen.getByRole("textbox", { name: "Charlie" })
    await user.clear(split2)
    await user.type(split2, "5")

    await waitFor(() => {
      expect(screen.getByText(/Allocated ₹30\.00 \/ ₹30\.00/i)).toBeInTheDocument()
      expect(screen.queryByText(/Split sum must equal total/i)).not.toBeInTheDocument()
    })
  })

  // 5. Percent split mode interactive editing
  it("percent split mode: editing percentages recalculates minor splits dynamically", async () => {
    const user = userEvent.setup()
    renderExpenseForm()

    const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
    await user.clear(amountInput)
    await user.type(amountInput, "100.00")

    // Switch to percent mode
    await user.click(screen.getByRole("button", { name: /^percent$/i }))

    const percentInputs = screen.getAllByPlaceholderText("%") as HTMLInputElement[]
    expect(percentInputs.length).toBe(3)

    // Set Alice=50%, Bob=30%, Charlie=20%
    await user.clear(percentInputs[0])
    await user.type(percentInputs[0], "50")

    await user.clear(percentInputs[1])
    await user.type(percentInputs[1], "30")

    await user.clear(percentInputs[2])
    await user.type(percentInputs[2], "20")

    await waitFor(() => {
      expect(screen.getByText(/Allocated ₹100\.00 \/ ₹100\.00/i)).toBeInTheDocument()
    })
  })

  // 6. Shares split mode interactive editing & persistence
  it("shares split mode: editing share counts recalculates integer minor split proportions", async () => {
    const user = userEvent.setup()
    renderExpenseForm()

    const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
    await user.clear(amountInput)
    await user.type(amountInput, "50.00")

    // Switch to shares mode
    await user.click(screen.getByRole("button", { name: /^shares$/i }))

    const shareInputs = screen.getAllByPlaceholderText("shares") as HTMLInputElement[]
    expect(shareInputs.length).toBe(3)

    // Set shares to 2, 2, 1 (total 5 shares -> 20.00, 20.00, 10.00)
    await user.clear(shareInputs[0])
    await user.type(shareInputs[0], "2")

    await user.clear(shareInputs[1])
    await user.type(shareInputs[1], "2")

    await user.clear(shareInputs[2])
    await user.type(shareInputs[2], "1")

    await waitFor(() => {
      expect(screen.getByText(/Allocated ₹50\.00 \/ ₹50\.00/i)).toBeInTheDocument()
    })
  })

  it("participant toggling in shares mode preserves existing share weights", async () => {
    const user = userEvent.setup()
    renderExpenseForm()

    // Switch to shares mode
    await user.click(screen.getByRole("button", { name: /^shares$/i }))

    // Change Alice's share to 3
    const shareInputs = screen.getAllByPlaceholderText("shares") as HTMLInputElement[]
    await user.clear(shareInputs[0])
    await user.type(shareInputs[0], "3")

    // Toggle Bob off
    const bobChip = screen.getByRole("button", { name: /Bob/i })
    await user.click(bobChip)

    // Alice should still have 3 shares
    const updatedShareInputs = screen.getAllByPlaceholderText("shares") as HTMLInputElement[]
    expect(updatedShareInputs[0].value).toBe("3")
    expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
  })

  // 7. Participant chip actions (Select all, Invert, Clear)
  it("participant chips: 'Select all', 'Clear', and 'Invert' update selected participants reactively", async () => {
    const user = userEvent.setup()
    renderExpenseForm()

    expect(screen.getByText(/Participants \(3 of 3\)/i)).toBeInTheDocument()

    // Click Clear
    const clearBtn = screen.getByRole("button", { name: /^clear$/i })
    await user.click(clearBtn)
    expect(screen.getByText(/Participants \(0 of 3\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Allocated ₹0\.00 \/ ₹10\.00/i)).toBeInTheDocument()

    // Click Select all
    const selectAllBtn = screen.getByRole("button", { name: /^select all$/i })
    await user.click(selectAllBtn)
    expect(screen.getByText(/Participants \(3 of 3\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()

    // Toggle Alice off (leaving Bob & Charlie)
    const aliceChip = screen.getByRole("button", { name: /Alice/i })
    await user.click(aliceChip)
    expect(screen.getByText(/Participants \(2 of 3\)/i)).toBeInTheDocument()

    // Click Invert (now Alice selected, Bob & Charlie deselected)
    const invertBtn = screen.getByRole("button", { name: /^invert$/i })
    await user.click(invertBtn)
    expect(screen.getByText(/Participants \(1 of 3\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
  })

  // 8. Multi-payer row additions, removals, and validation sync
  it("multi-payer rows: adding and removing payers updates totals and clears payer validation errors", async () => {
    const user = userEvent.setup()
    renderExpenseForm()

    const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
    await user.clear(amountInput)
    await user.type(amountInput, "50.00")

    // Click "+ Add multiple payers"
    const addPayerBtn = screen.getByRole("button", { name: /\+ Add multiple payers/i })
    await user.click(addPayerBtn)

    // Select Bob for the second payer
    const payerSelects = screen.getAllByRole("combobox")
    await user.selectOptions(payerSelects[1], "u2")

    // Change payer 0 (Alice) to 30 and payer 1 (Bob) to 20
    const aliceInput = screen.getByRole("textbox", { name: "Payer amount for Alice" })
    await user.clear(aliceInput)
    await user.type(aliceInput, "30")

    const bobInput = screen.getByRole("textbox", { name: "Payer amount for Bob" })
    await user.clear(bobInput)
    await user.type(bobInput, "20")

    await waitFor(() => {
      expect(screen.getByText(/Total ₹50\.00 \/ ₹50\.00/i)).toBeInTheDocument()
      expect(screen.queryByText(/Payer sum must equal total/i)).not.toBeInTheDocument()
    })

    // Remove the second payer row
    const removePayerBtns = screen.getAllByRole("button", { name: "×" })
    await user.click(removePayerBtns[0])

    // Should return to single payer with amount synced to total 50.00
    await waitFor(() => {
      expect(screen.getByText(/Total ₹50\.00 \/ ₹50\.00/i)).toBeInTheDocument()
    })
  })

  // 9. Visual Category selection
  it("visual category selection updates selected category styling", async () => {
    const user = userEvent.setup()
    renderExpenseForm()

    // Click Transport category button
    const transportBtn = screen.getByRole("button", { name: /Transport/i })
    await user.click(transportBtn)
    expect(transportBtn.className).toContain("border-brand")

    // Click Stay category button
    const stayBtn = screen.getByRole("button", { name: /Stay/i })
    await user.click(stayBtn)
    expect(stayBtn.className).toContain("border-brand")
  })

  // 10. 0-decimal JPY full workflow
  it("JPY 0-decimal flow: handles integer minor currency without decimals", async () => {
    mockTripCurrency = "JPY"
    const user = userEvent.setup()
    renderExpenseForm()

    const amountInput = screen.getByLabelText(/Amount \(JPY\)/i) as HTMLInputElement
    await user.clear(amountInput)
    await user.type(amountInput, "9000")

    await waitFor(() => {
      expect(screen.getByText(/Total ¥9,000 \/ ¥9,000/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ¥9,000 \/ ¥9,000/i)).toBeInTheDocument()
      expect(screen.getByText(/¥3,000 \/ person/i)).toBeInTheDocument()
    })

    // Type description and submit
    const descInput = screen.getByLabelText(/Description/i)
    await user.type(descInput, "Tokyo Metro Pass")

    const submitBtn = screen.getByRole("button", { name: /^save expense$/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Tokyo Metro Pass",
          amountMinor: 9000,
          currency: "JPY",
        })
      )
    })
  })
})
