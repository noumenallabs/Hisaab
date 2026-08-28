import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ExpenseFormPage } from "@/features/expenses/ExpenseFormPage"
import { CreateTripPage } from "@/features/trips/CreateTripPage"
import { SignUpPage } from "@/features/auth/SignUpPage"
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage"
import { SettlementDialog } from "@/features/balances/SettlementDialog"
import { CurrencyInput } from "@/components/forms/CurrencyInput"
import { parseCurrencyInput } from "@/lib/currency"
import { allocateShares, allocatePercent } from "@/features/expenses/money"

const mockMembers = [
  { user_id: "u1", name: "Alice", email: "alice@test.com", role: "owner" },
  { user_id: "u2", name: "Bob", email: "bob@test.com", role: "member" },
  { user_id: "u3", name: "Charlie", email: "charlie@test.com", role: "member" },
  { user_id: "u4", name: "Diana", email: "diana@test.com", role: "member" },
  { user_id: "u5", name: "Edward", email: "edward@test.com", role: "member" },
]

let mockTripCurrency = "INR"
const mockSaveExpense = vi.fn().mockResolvedValue({ id: "exp-saved-1" })

vi.mock("@/features/trips/useMembers", () => ({
  useTripMembers: () => ({
    data: mockMembers,
    isLoading: false,
  }),
  tripMembersKeys: {
    list: (tripId: string) => ["trip_members", tripId],
  },
}))

vi.mock("@/features/trips/hooks", () => ({
  useTrip: () => ({
    data: {
      id: "trip-adv-1",
      name: "Adversarial Stress Trip",
      base_currency: mockTripCurrency,
      status: "active",
    },
    isLoading: false,
  }),
  useCreateTrip: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: "trip-created-1" }),
    isPending: false,
  }),
}))

vi.mock("@/features/expenses/hooks", () => ({
  useSaveExpense: () => ({
    mutateAsync: mockSaveExpense,
    isPending: false,
  }),
  useExpense: () => ({
    data: null,
    isLoading: false,
  }),
}))

const mockRpc = vi.fn().mockResolvedValue({ data: { id: "rpc-res-1" }, error: null })

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: mockRpc,
    auth: {
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }),
  isSupabaseConfigured: true,
}))

const mockAuthUser = { id: "u1", name: "Alice", email: "alice@test.com" }
const mockSetCustomUser = vi.fn()
const mockSignUp = vi.fn().mockResolvedValue({})

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mockAuthUser,
    setCustomUser: mockSetCustomUser,
    signUp: mockSignUp,
    signInWithGoogle: vi.fn(),
  }),
}))

function renderExpenseForm() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/trips/trip-adv-1/expenses/new"]}>
        <Routes>
          <Route path="/trips/:tripId/expenses/new" element={<ExpenseFormPage />} />
          <Route path="/trips/:tripId/expenses" element={<div>Expenses List</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe("Adversarial Stress Testing: Interactive State Machines & User Events", () => {
  beforeEach(() => {
    mockTripCurrency = "INR"
    mockSaveExpense.mockClear()
    mockRpc.mockClear()
    mockRpc.mockResolvedValue({ data: { id: "rpc-res-1" }, error: null })
    localStorage.clear()
  })

  // ---------------------------------------------------------------------------
  // SECTION 1: RAPID SPLIT MODE TRANSITIONS & CONSERVATION UNDER STRESS
  // ---------------------------------------------------------------------------
  describe("1. Rapid Split Mode Transitions (equal -> exact -> percent -> shares -> equal)", () => {
    it("cycles 40 rapid split mode transitions without throwing, NaN, or breaking minor unit conservation", async () => {
      const user = userEvent.setup()
      renderExpenseForm()

      const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
      await user.clear(amountInput)
      await user.type(amountInput, "99.97") // Odd total with 5 participants (9997 minor units)

      const equalBtn = screen.getByRole("button", { name: /^equal$/i })
      const exactBtn = screen.getByRole("button", { name: /^exact$/i })
      const percentBtn = screen.getByRole("button", { name: /^percent$/i })
      const sharesBtn = screen.getByRole("button", { name: /^shares$/i })

      // Rapidly loop 10 cycles of all 4 modes (40 button clicks)
      for (let i = 0; i < 10; i++) {
        await user.click(exactBtn)
        await user.click(percentBtn)
        await user.click(sharesBtn)
        await user.click(equalBtn)
      }

      // Assert that after rapid cycling, allocated amount is exactly ₹99.97
      expect(screen.getByText(/Allocated ₹99\.97 \/ ₹99\.97/i)).toBeInTheDocument()
      expect(screen.queryByText(/Split sum must equal total/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument()
    })

    it("switching to percent mode automatically synthesizes integer percents summing to 100% across uneven member counts", async () => {
      const user = userEvent.setup()
      renderExpenseForm()

      // 5 members -> 20% each
      const percentBtn = screen.getByRole("button", { name: /^percent$/i })
      await user.click(percentBtn)

      const pInputs = screen.getAllByPlaceholderText("%") as HTMLInputElement[]
      expect(pInputs.length).toBe(5)
      const sum = pInputs.reduce((acc, el) => acc + Number(el.value), 0)
      expect(sum).toBe(100)

      // Switch to 3 members by deselecting 2 members
      const dianaChip = screen.getByRole("button", { name: /Diana/i })
      const edwardChip = screen.getByRole("button", { name: /Edward/i })
      await user.click(dianaChip)
      await user.click(edwardChip)

      // Re-trigger percent mode logic
      await user.click(screen.getByRole("button", { name: /^equal$/i }))
      await user.click(percentBtn)

      // 3 members -> 34%, 33%, 33% = 100%
      const pInputs3 = screen.getAllByPlaceholderText("%") as HTMLInputElement[]
      expect(pInputs3.length).toBe(3)
      const sum3 = pInputs3.reduce((acc, el) => acc + Number(el.value), 0)
      expect(sum3).toBe(100)
    })

    it("shares split mode allocates exact integer minor remainder without losing 1 cent", () => {
      // Direct money allocation stress test with awkward shares and prime totals
      const totalMinor = 10001 // ₹100.01
      const shares = [3, 7, 11, 13, 17] // Sum = 51 shares
      const alloc = allocateShares(totalMinor, shares)
      expect(alloc).not.toBeNull()
      expect(alloc!.length).toBe(5)
      const sum = alloc!.reduce((a, b) => a + b, 0)
      expect(sum).toBe(totalMinor) // Zero drift!
    })

    it("percent split mode allocates exact integer minor remainder across fractional percentages", () => {
      const totalMinor = 33333 // ₹333.33
      const percents = [33, 33, 34] // 100%
      const alloc = allocatePercent(totalMinor, percents)
      expect(alloc).not.toBeNull()
      expect(alloc!.length).toBe(3)
      const sum = alloc!.reduce((a, b) => a + b, 0)
      expect(sum).toBe(totalMinor)
    })
  })

  // ---------------------------------------------------------------------------
  // SECTION 2: PARTICIPANT CHIP COMBINATIONS (Select All, Invert, Clear, Toggles)
  // ---------------------------------------------------------------------------
  describe("2. Participant Chip Combinations and Boundary States", () => {
    it("handles Clearing all participants (0 participants) without NaN or crash, then re-selecting", async () => {
      const user = userEvent.setup()
      renderExpenseForm()

      const clearBtn = screen.getByRole("button", { name: /^clear$/i })
      await user.click(clearBtn)

      expect(screen.getByText(/Participants \(0 of 5\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ₹0\.00 \/ ₹10\.00/i)).toBeInTheDocument()
      expect(screen.queryByText(/NaN/i)).not.toBeInTheDocument()

      // Switch modes while 0 participants are selected (adversarial boundary check)
      await user.click(screen.getByRole("button", { name: /^exact$/i }))
      await user.click(screen.getByRole("button", { name: /^percent$/i }))
      await user.click(screen.getByRole("button", { name: /^shares$/i }))
      await user.click(screen.getByRole("button", { name: /^equal$/i }))

      // Select all
      const selectAllBtn = screen.getByRole("button", { name: /^select all$/i })
      await user.click(selectAllBtn)

      expect(screen.getByText(/Participants \(5 of 5\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
    })

    it("inverting participant selections preserves state in exact split mode", async () => {
      const user = userEvent.setup()
      renderExpenseForm()

      // Switch to exact mode
      await user.click(screen.getByRole("button", { name: /^exact$/i }))

      // Turn off Alice and Bob -> Charlie, Diana, Edward active
      await user.click(screen.getByRole("button", { name: /Alice/i }))
      await user.click(screen.getByRole("button", { name: /Bob/i }))
      expect(screen.getByText(/Participants \(3 of 5\)/i)).toBeInTheDocument()

      // Invert -> Alice and Bob active, Charlie, Diana, Edward inactive
      const invertBtn = screen.getByRole("button", { name: /^invert$/i })
      await user.click(invertBtn)
      expect(screen.getByText(/Participants \(2 of 5\)/i)).toBeInTheDocument()

      // Only Alice and Bob exact inputs should be present
      expect(screen.getByRole("textbox", { name: "Alice" })).toBeInTheDocument()
      expect(screen.getByRole("textbox", { name: "Bob" })).toBeInTheDocument()
      expect(screen.queryByRole("textbox", { name: "Charlie" })).not.toBeInTheDocument()
    })

    it("single participant toggle: 1 participant takes 100% of expense in equal mode", async () => {
      const user = userEvent.setup()
      renderExpenseForm()

      // Clear all then select only Diana
      await user.click(screen.getByRole("button", { name: /^clear$/i }))
      await user.click(screen.getByRole("button", { name: /Diana/i }))

      expect(screen.getByText(/Participants \(1 of 5\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
      expect(screen.getByText(/₹10\.00 \/ person/i)).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // SECTION 3: KEYSTROKE TYPING, CURRENCY INPUT & LEADING/TRAILING DECIMALS
  // ---------------------------------------------------------------------------
  describe("3. Keystroke Typing, Intermediate Decimals & Schema Validation", () => {
    it("CurrencyInput: handles intermediate typing with leading dot '.', trailing zeros, and currency changes without wiping text", async () => {
      const handleChange = vi.fn()
      const { rerender } = render(
        <CurrencyInput
          valueMinor={null}
          onChange={handleChange}
          currency="INR"
          aria-label="Test Currency Input"
        />
      )

      const input = screen.getByLabelText("Test Currency Input") as HTMLInputElement

      // Type leading dot ".5" -> 50 cents/paise
      fireEvent.change(input, { target: { value: ".5" } })
      expect(input.value).toBe(".5")
      expect(handleChange).toHaveBeenLastCalledWith(50)

      // Type "12." (intermediate decimal typing before typing fraction)
      fireEvent.change(input, { target: { value: "12." } })
      expect(input.value).toBe("12.")
      expect(handleChange).toHaveBeenLastCalledWith(1200)

      // Type "12.75"
      fireEvent.change(input, { target: { value: "12.75" } })
      expect(input.value).toBe("12.75")
      expect(handleChange).toHaveBeenLastCalledWith(1275)

      // Reject too many decimals: "12.755" returns null
      fireEvent.change(input, { target: { value: "12.755" } })
      expect(input.value).toBe("12.755")
      expect(handleChange).toHaveBeenLastCalledWith(null)

      // Rerender with 0-decimal JPY currency
      rerender(
        <CurrencyInput
          valueMinor={5000}
          onChange={handleChange}
          currency="JPY"
          aria-label="Test Currency Input"
        />
      )
      expect(input.value).toBe("5000")
    })

    it("parseCurrencyInput: parses edge inputs safely across 0-decimal (JPY) and 2-decimal (INR/USD)", () => {
      // 2-decimal INR
      expect(parseCurrencyInput("100.50", "INR")).toBe(10050)
      expect(parseCurrencyInput(".5", "INR")).toBe(50)
      expect(parseCurrencyInput("0.05", "INR")).toBe(5)
      expect(parseCurrencyInput("0", "INR")).toBe(0)
      expect(parseCurrencyInput("1,250.75", "INR")).toBe(125075)
      expect(parseCurrencyInput(".", "INR")).toBeNull()
      expect(parseCurrencyInput("-", "INR")).toBeNull()
      expect(parseCurrencyInput("abc", "INR")).toBeNull()
      expect(parseCurrencyInput("10.999", "INR")).toBeNull() // Exceeds 2 decimals

      // 0-decimal JPY
      expect(parseCurrencyInput("5000", "JPY")).toBe(5000)
      expect(parseCurrencyInput("5,000", "JPY")).toBe(5000)
      expect(parseCurrencyInput("5000.5", "JPY")).toBeNull() // Decimals forbidden for JPY
    })

    it("ExpenseFormPage: typing invalid amount shows error, typing valid amount clears error immediately", async () => {
      const user = userEvent.setup()
      renderExpenseForm()

      const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
      
      // Clear amount to 0
      await user.clear(amountInput)
      await user.type(amountInput, "0")

      // Trigger submit to get validation error
      const submitBtn = screen.getByRole("button", { name: /^save expense$/i })
      await user.click(submitBtn)

      expect(await screen.findByText(/greater than 0/i)).toBeInTheDocument()

      // Type valid amount 45.00
      await user.clear(amountInput)
      await user.type(amountInput, "45.00")

      // Error must be dismissed reactively
      await waitFor(() => {
        expect(screen.queryByText(/greater than 0/i)).not.toBeInTheDocument()
      })
    })
  })

  // ---------------------------------------------------------------------------
  // SECTION 4: CROSS-FIELD DATE CORRECTIONS & PASSWORD MATCHING
  // ---------------------------------------------------------------------------
  describe("4. Cross-Field Reactive Validation & State Clearing", () => {
    it("CreateTripPage: cross-field date validation dynamically clears error when start is adjusted before end", async () => {
      const user = userEvent.setup()
      const qc = new QueryClient()

      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <CreateTripPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      const startInput = screen.getByLabelText(/START DATE/i) as HTMLInputElement
      const endInput = screen.getByLabelText(/END DATE/i) as HTMLInputElement

      // Type start date after end date (2026-11-20 > 2026-11-10)
      await user.clear(endInput)
      await user.type(endInput, "2026-11-10")
      await user.clear(startInput)
      await user.type(startInput, "2026-11-20")

      expect(await screen.findByText(/End date must be on or after start/i)).toBeInTheDocument()

      // Correct start date to 2026-11-01
      await user.clear(startInput)
      await user.type(startInput, "2026-11-01")

      await waitFor(() => {
        expect(screen.queryByText(/End date must be on or after start/i)).not.toBeInTheDocument()
      })
    })

    it("SignUpPage: cross-field password matching dynamically dismisses error as soon as passwords match", async () => {
      const user = userEvent.setup()

      render(
        <MemoryRouter>
          <SignUpPage />
        </MemoryRouter>
      )

      const nameInput = screen.getByLabelText(/Your Name/i)
      const emailInput = screen.getByLabelText(/Email Address/i)
      const passInput = screen.getByLabelText(/^Password/i)
      const confirmInput = screen.getByLabelText(/Confirm Password/i)

      await user.type(nameInput, "Tester")
      await user.type(emailInput, "tester@test.com")
      // Enter mismatched valid passwords (>=8 chars)
      await user.type(passInput, "Password!1")
      await user.type(confirmInput, "Password!2")

      expect(await screen.findByText(/Passwords must match/i)).toBeInTheDocument()

      // Fix confirm password by backspacing '2' and typing '1'
      await user.type(confirmInput, "{backspace}1")

      await waitFor(() => {
        expect(screen.queryByText(/Passwords must match/i)).not.toBeInTheDocument()
      })
    })

    it("ResetPasswordPage: cross-field password matching dynamically clears error when password is fixed", async () => {
      const user = userEvent.setup()

      render(
        <MemoryRouter>
          <ResetPasswordPage />
        </MemoryRouter>
      )

      const passInput = screen.getByLabelText(/New Password/i)
      const confirmInput = screen.getByLabelText(/Confirm Password/i)

      // Enter valid length (>=8 chars) passwords that differ
      await user.type(passInput, "securepass1")
      await user.type(confirmInput, "securepass2")

      expect(await screen.findByText(/Passwords must match/i)).toBeInTheDocument()

      // Update password to match confirm
      await user.clear(passInput)
      await user.type(passInput, "securepass2")

      await waitFor(() => {
        expect(screen.queryByText(/Passwords must match/i)).not.toBeInTheDocument()
      })
    })
  })

  // ---------------------------------------------------------------------------
  // SECTION 5: SETTLEMENT DIALOG INTERACTIVE & QUICK ACTIONS
  // ---------------------------------------------------------------------------
  describe("5. SettlementDialog Quick Actions & State Sync", () => {
    it("SettlementDialog: Full amount button and custom amount typing reactively update confirmation text and clears errors", async () => {
      const user = userEvent.setup()
      const onSuccess = vi.fn()
      const onClose = vi.fn()

      render(
        <SettlementDialog
          open={true}
          onClose={onClose}
          tripId="trip-adv-1"
          fromId="u2"
          toId="u1"
          fromName="Bob"
          toName="Alice"
          outstandingMinor={40000} // ₹400.00
          currency="INR"
          onSuccess={onSuccess}
        />
      )

      // Input should start with 400
      const amountInput = screen.getByLabelText(/Amount \(INR\)/i) as HTMLInputElement
      expect(amountInput.value).toBe("400")

      // Edit amount to 150.50
      await user.clear(amountInput)
      await user.type(amountInput, "150.50")

      expect(screen.getByText(/Recording ₹150\.50/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /Confirm ₹150\.50/i })).toBeInTheDocument()

      // Click "Full amount: ₹400.00" button
      const fullAmountBtn = screen.getByRole("button", { name: /Full amount: ₹400\.00/i })
      await user.click(fullAmountBtn)

      expect(amountInput.value).toBe("400")
      expect(screen.getByRole("button", { name: /Confirm ₹400\.00/i })).toBeInTheDocument()

      // Try typing an amount greater than outstanding: 500.00 -> should show error on submit
      await user.clear(amountInput)
      await user.type(amountInput, "500.00")

      const submitBtn = screen.getByRole("button", { name: /Confirm ₹500\.00/i })
      await user.click(submitBtn)

      expect(await screen.findByText(/exceeds outstanding/i)).toBeInTheDocument()

      // Fix amount back to 300.00 -> typing must reactively dismiss the error
      await user.clear(amountInput)
      await user.type(amountInput, "300.00")

      expect(screen.queryByText(/exceeds outstanding/i)).not.toBeInTheDocument()

      // Submit valid settlement
      await user.click(screen.getByRole("button", { name: /Confirm ₹300\.00/i }))

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith(
          "record_settlement",
          expect.objectContaining({
            p_payload: expect.objectContaining({
              amountMinor: 30000,
              fromUserId: "u2",
              toUserId: "u1",
              tripId: "trip-adv-1",
            }),
          })
        )
      })
    })
  })
})
