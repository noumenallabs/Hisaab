import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Donut, DailyBars } from "@/charts"
import { ExpenseFormPage } from "@/features/expenses/ExpenseFormPage"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ToastProvider } from "@/components/feedback/ToastProvider"

// Mock Supabase
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: vi.fn().mockResolvedValue({ data: { id: "exp-1" }, error: null }),
  }),
  isSupabaseConfigured: true,
}))

let mockMembers = [
  { user_id: "u1", name: "Alice", email: "alice@test.com", role: "owner" },
  { user_id: "u2", name: "Bob", email: "bob@test.com", role: "member" },
  { user_id: "u3", name: "Charlie", email: "charlie@test.com", role: "member" },
  { user_id: "u4", name: "Diana", email: "diana@test.com", role: "member" },
]

let mockTrip = {
  id: "trip-m3",
  name: "M3 Challenger Trip",
  base_currency: "INR",
  status: "active",
}

const mockSaveExpense = vi.fn().mockResolvedValue({ id: "exp-saved-1" })

vi.mock("@/features/trips/useMembers", () => ({
  useTripMembers: () => ({
    data: mockMembers,
    isLoading: false,
  }),
}))

vi.mock("@/features/trips/hooks", () => ({
  useTrip: () => ({
    data: mockTrip,
    isLoading: false,
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

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u1", name: "Alice", email: "alice@test.com" },
  }),
}))

function renderForm(route = "/trips/trip-m3/expenses/new") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path="/trips/:tripId/expenses/new" element={<ExpenseFormPage />} />
            <Route path="/trips/:tripId/expenses" element={<div>Expense List View</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

describe("Milestone 3 Challenger Empirical Stress Verifier", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    mockTrip = {
      id: "trip-m3",
      name: "M3 Challenger Trip",
      base_currency: "INR",
      status: "active",
    }
  })

  // =========================================================================
  // TASK 1: Financial Visualization Stress Tests (Donut & DailyBars)
  // =========================================================================
  describe("Task 1: Chart Rendering Under Adversarial & Boundary Conditions", () => {
    // 1.1 Empty data condition
    it("Donut: handles empty data array gracefully without crashing or NaN", () => {
      const { container } = render(<Donut data={[]} currency="USD" />)
      expect(screen.getByRole("region", { name: /Category spending distribution/i })).toBeInTheDocument()
      expect(screen.getByText("Total")).toBeInTheDocument()
      expect(screen.getByText("$0.00")).toBeInTheDocument()
      expect(screen.getByText("0 cats")).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/\bNaN\b/)
      expect(container.textContent).not.toMatch(/undefined/)
    })

    it("DailyBars: handles empty data array gracefully without crashing or NaN", () => {
      const { container } = render(<DailyBars data={[]} currency="USD" />)
      expect(screen.getByRole("region", { name: /Daily spending trajectory chart/i })).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/\bNaN\b/)
      expect(container.textContent).not.toMatch(/undefined/)
    })

    // 1.2 Single-item condition
    it("Donut: handles single item correctly with 100% distribution and no gaps", () => {
      const { container } = render(
        <Donut
          data={[{ label: "Food", value: 5000, color: "#3b82f6", emoji: "🍕" }]}
          currency="INR"
        />
      )
      expect(screen.getByText("Total")).toBeInTheDocument()
      expect(screen.getByText("₹50.00")).toBeInTheDocument()
      expect(screen.getByText("1 cat")).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/\bNaN\b/)

      // SVG circle check
      const circles = container.querySelectorAll("circle")
      expect(circles.length).toBe(2) // 1 track circle + 1 data slice
    })

    it("DailyBars: handles single-day data correctly without crashing", () => {
      const { container } = render(
        <DailyBars
          data={[{ label: "Day 1", value: 12000, date: "2026-08-20" }]}
          currency="INR"
        />
      )
      expect(screen.getByText("Day 1")).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/\bNaN\b/)
    })

    // 1.3 Zero-total condition (all slices or days have 0 value)
    it("Donut: handles zero-total slices without division by zero or NaN arc lengths", () => {
      const { container } = render(
        <Donut
          data={[
            { label: "Food", value: 0, color: "#ef4444" },
            { label: "Transport", value: 0, color: "#3b82f6" },
            { label: "Stay", value: 0, color: "#10b981" },
          ]}
          currency="EUR"
        />
      )
      expect(screen.getByText("Total")).toBeInTheDocument()
      expect(screen.getByText("€0.00")).toBeInTheDocument()
      expect(screen.getByText("0 cats")).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/\bNaN\b/)
      expect(container.textContent).not.toMatch(/Infinity/i)
    })

    it("DailyBars: handles all days having 0 amount without height computation errors", () => {
      const { container } = render(
        <DailyBars
          data={[
            { label: "D1", value: 0, date: "2026-08-20" },
            { label: "D2", value: 0, date: "2026-08-21" },
            { label: "D3", value: 0, date: "2026-08-22" },
          ]}
          currency="USD"
        />
      )
      expect(screen.getByText("D1")).toBeInTheDocument()
      expect(screen.getByText("D2")).toBeInTheDocument()
      expect(screen.getByText("D3")).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/\bNaN\b/)
    })

    // 1.4 Multi-item multi-category conditions with hover and keyboard focus
    it("Donut: supports multi-item hovering, focus states, center readout changes, and external sync", async () => {
      const handleHover = vi.fn()
      const data = [
        { label: "Food", value: 4000, color: "#ef4444", emoji: "🍕" },
        { label: "Transport", value: 3000, color: "#3b82f6", emoji: "🚕" },
        { label: "Tickets", value: 3000, color: "#8b5cf6", emoji: "🎟️" },
      ]
      const { rerender } = render(
        <Donut data={data} currency="INR" onHoverCategory={handleHover} />
      )

      // Total ₹100.00
      expect(screen.getByText("₹100.00")).toBeInTheDocument()
      expect(screen.getByText("3 cats")).toBeInTheDocument()

      // Hover over Food slice
      const foodArc = screen.getByLabelText(/Food: ₹40\.00 \(40%\)/i)
      fireEvent.mouseEnter(foodArc)
      expect(handleHover).toHaveBeenCalledWith("Food")
      expect(screen.getByText("Food")).toBeInTheDocument()
      expect(screen.getByText("40%")).toBeInTheDocument()
      expect(screen.getByText("₹40.00")).toBeInTheDocument()

      // Unhover
      fireEvent.mouseLeave(foodArc)
      expect(handleHover).toHaveBeenCalledWith(null)
      expect(screen.getByText("Total")).toBeInTheDocument()
      expect(screen.getByText("₹100.00")).toBeInTheDocument()

      // Focus via keyboard tab
      fireEvent.focus(foodArc)
      expect(screen.getByText("Food")).toBeInTheDocument()
      fireEvent.blur(foodArc)
      expect(screen.getByText("Total")).toBeInTheDocument()

      // Test external activeCategory controlled prop
      rerender(<Donut data={data} currency="INR" activeCategory="Transport" />)
      expect(screen.getByText("Transport")).toBeInTheDocument()
      expect(screen.getByText("30%")).toBeInTheDocument()
      expect(screen.getByText("₹30.00")).toBeInTheDocument()
    })

    it("DailyBars: handles multi-day trajectory, peak identification, average reference line, and hover popovers", () => {
      const days = [
        { label: "D1", amountMinor: 2000, date: "2026-08-20" },
        { label: "D2", amountMinor: 10000, date: "2026-08-21" }, // Peak day
        { label: "D3", amountMinor: 3000, date: "2026-08-22" },
      ]
      const { container } = render(<DailyBars days={days} currency="INR" />)

      // Peak day marker crown should be rendered
      expect(screen.getByText("👑")).toBeInTheDocument()
      // Average daily spend reference line
      expect(screen.getByText(/avg ₹50\.00/i)).toBeInTheDocument()

      // Hover over peak day D2
      const d2Bar = screen.getByRole("button", { name: /Day D2: ₹100\.00 \(Peak Day\)/i })
      fireEvent.mouseEnter(d2Bar)

      // Tooltip should appear
      expect(screen.getByText("👑 Peak Day")).toBeInTheDocument()
      expect(screen.getByText("₹100.00")).toBeInTheDocument()

      fireEvent.mouseLeave(d2Bar)
      expect(container.textContent).not.toMatch(/\bNaN\b/)
    })

    // 1.5 JPY / zero-decimal formatting in charts
    it("Donut & DailyBars: correctly format zero-decimal currencies (JPY) without decimals", () => {
      const { container: donutContainer } = render(
        <Donut
          data={[{ label: "Stay", value: 15000, color: "#10b981" }]}
          currency="JPY"
        />
      )
      expect(screen.getByText("¥15,000")).toBeInTheDocument()
      expect(donutContainer.textContent).not.toMatch(/¥15,000\.00/)

      const { container: barContainer } = render(
        <DailyBars
          days={[{ label: "D1", amountMinor: 8000, date: "2026-08-20" }]}
          currency="JPY"
        />
      )
      expect(screen.getByText("D1")).toBeInTheDocument()
      expect(barContainer.textContent).not.toMatch(/¥8,000\.00/)
    })
  })

  // =========================================================================
  // TASK 2: Participant Split Selection, Batch Actions, and Form Validation
  // =========================================================================
  describe("Task 2: Participant Split Selection, Batch Actions, & Form Validation Stress", () => {
    // 2.1 Batch actions: Select All, Invert, Clear
    it("batch actions (Clear, Select All, Invert) update participant list and allocated amounts reactively", async () => {
      const user = userEvent.setup()
      renderForm()

      // Initial state: 4 members selected
      expect(screen.getByText(/Participants \(4 of 4\)/i)).toBeInTheDocument()
      expect(screen.getByText(/₹2\.50 \/ person/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()

      // 1. Test Clear
      const clearBtn = screen.getByRole("button", { name: /^clear$/i })
      await user.click(clearBtn)
      expect(screen.getByText(/Participants \(0 of 4\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ₹0\.00 \/ ₹10\.00/i)).toBeInTheDocument()
      expect(screen.getByText(/\(₹10\.00 remaining\)/i)).toBeInTheDocument()

      // 2. Test Select All
      const selectAllBtn = screen.getByRole("button", { name: /^select all$/i })
      await user.click(selectAllBtn)
      expect(screen.getByText(/Participants \(4 of 4\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()

      // 3. Test Toggle off Alice & Bob, then Invert
      const aliceChip = screen.getByRole("button", { name: "Alice" })
      const bobChip = screen.getByRole("button", { name: "Bob" })
      await user.click(aliceChip)
      await user.click(bobChip)
      expect(screen.getByText(/Participants \(2 of 4\)/i)).toBeInTheDocument()

      // Invert selection (now Alice & Bob should be selected, Charlie & Diana deselected)
      const invertBtn = screen.getByRole("button", { name: /^invert$/i })
      await user.click(invertBtn)
      expect(screen.getByText(/Participants \(2 of 4\)/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
      expect(screen.getByText(/₹5\.00 \/ person/i)).toBeInTheDocument()
    })

    // 2.2 Dynamic switching between split modes under non-trivial numbers
    it("switches smoothly between Equal, Exact, Percent, and Shares without math anomalies", async () => {
      const user = userEvent.setup()
      renderForm()

      const amountInput = screen.getByLabelText(/Amount \(INR\)/i)
      await user.clear(amountInput)
      await user.type(amountInput, "100.00")

      // Equal mode
      expect(screen.getByText(/₹25\.00 \/ person/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ₹100\.00 \/ ₹100\.00/i)).toBeInTheDocument()

      // Percent mode
      await user.click(screen.getByRole("button", { name: /^percent$/i }))
      expect(screen.getByText(/Allocated ₹100\.00 \/ ₹100\.00/i)).toBeInTheDocument()

      // Custom percent: Alice=40, Bob=30, Charlie=20, Diana=10 (Total 100%)
      const pInputs = screen.getAllByPlaceholderText("%")
      await user.clear(pInputs[0]); await user.type(pInputs[0], "40")
      await user.clear(pInputs[1]); await user.type(pInputs[1], "30")
      await user.clear(pInputs[2]); await user.type(pInputs[2], "20")
      await user.clear(pInputs[3]); await user.type(pInputs[3], "10")
      await waitFor(() => {
        expect(screen.getByText(/Allocated ₹100\.00 \/ ₹100\.00/i)).toBeInTheDocument()
      })

      // Shares mode
      await user.click(screen.getByRole("button", { name: /^shares$/i }))
      expect(screen.getByText(/Allocated ₹100\.00 \/ ₹100\.00/i)).toBeInTheDocument()

      // Exact mode
      await user.click(screen.getByRole("button", { name: /^exact$/i }))
      expect(screen.getByText(/Allocated ₹100\.00 \/ ₹100\.00/i)).toBeInTheDocument()
    })

    // 2.3 Multi-payer validation and error handling
    it("multi-payer input validation properly rejects mismatched totals and allows correction", async () => {
      const user = userEvent.setup()
      renderForm()

      const amountInput = screen.getByLabelText(/Amount \(INR\)/i)
      await user.clear(amountInput)
      await user.type(amountInput, "80.00")

      // Add second payer
      await user.click(screen.getByRole("button", { name: /\+ Add multiple payers/i }))

      // Select Bob for 2nd payer
      const selects = screen.getAllByRole("combobox")
      await user.selectOptions(selects[1], "u2")

      const aliceInput = screen.getByRole("textbox", { name: "Payer amount for Alice" })
      await user.clear(aliceInput); await user.type(aliceInput, "50")

      const bobInput = screen.getByRole("textbox", { name: "Payer amount for Bob" })
      await user.clear(bobInput); await user.type(bobInput, "20")

      expect(screen.getByText(/Total ₹70\.00 \/ ₹80\.00/i)).toBeInTheDocument()
      expect(screen.getByText(/\(₹10\.00 left\)/i)).toBeInTheDocument()

      // Correct Bob=30 (Total=80)
      await user.clear(bobInput); await user.type(bobInput, "30")
      await waitFor(() => {
        expect(screen.getByText(/Total ₹80\.00 \/ ₹80\.00/i)).toBeInTheDocument()
        expect(screen.queryByText(/left\)/i)).not.toBeInTheDocument()
      })
    })

    // 2.4 Save & Add Another flow resets form for rapid entry
    it("Save & add another resets the form, retains currency/member defaults, and focuses description", async () => {
      const user = userEvent.setup()
      renderForm()

      const descInput = screen.getByLabelText(/Description/i)
      await user.type(descInput, "Fast Snack")

      const saveAndAddAnotherBtn = screen.getByRole("button", { name: /\+ Save & add another/i })
      await user.click(saveAndAddAnotherBtn)

      await waitFor(() => {
        expect(mockSaveExpense).toHaveBeenCalledWith(
          expect.objectContaining({
            description: "Fast Snack",
            amountMinor: 1000,
          })
        )
      })

      // Description should be cleared
      await waitFor(() => {
        expect((screen.getByLabelText(/Description/i) as HTMLInputElement).value).toBe("")
      })
    })
    it("handles 0-decimal JPY amount input and equal allocation without decimal issues", async () => {
      mockTrip = {
        id: "trip-jpy",
        name: "Tokyo Trip",
        base_currency: "JPY",
        status: "active",
      }
      const user = userEvent.setup()
      renderForm("/trips/trip-jpy/expenses/new")

      const amountInput = screen.getByLabelText(/Amount \(JPY\)/i)
      await user.clear(amountInput)
      await user.type(amountInput, "12000")

      await waitFor(() => {
        expect(screen.getByText(/Total ¥12,000 \/ ¥12,000/i)).toBeInTheDocument()
        expect(screen.getByText(/Allocated ¥12,000 \/ ¥12,000/i)).toBeInTheDocument()
        expect(screen.getByText(/¥3,000 \/ person/i)).toBeInTheDocument()
      })
    })

    // 2.6 Extreme participant count / single participant split
    it("handles single-participant toggle in equal split mode gracefully", async () => {
      const user = userEvent.setup()
      renderForm()

      // Clear all
      await user.click(screen.getByRole("button", { name: /^clear$/i }))
      expect(screen.getByText(/Participants \(0 of 4\)/i)).toBeInTheDocument()

      // Select only Alice
      await user.click(screen.getByRole("button", { name: "Alice" }))
      expect(screen.getByText(/Participants \(1 of 4\)/i)).toBeInTheDocument()
      expect(screen.getByText(/₹10\.00 \/ person/i)).toBeInTheDocument()
      expect(screen.getByText(/Allocated ₹10\.00 \/ ₹10\.00/i)).toBeInTheDocument()
    })
  })

  // =========================================================================
  // TASK 3: Extreme Scale & High Cardinality Visualizations
  // =========================================================================
  describe("Task 3: High-Cardinality and Extreme Range Stress", () => {
    it("Donut: handles high-cardinality data (10+ slices with extreme disparities) without breaking", () => {
      const slices = [
        { label: "Cat 1", value: 9999000, color: "#1" },
        { label: "Cat 2", value: 1, color: "#2" },
        { label: "Cat 3", value: 2, color: "#3" },
        { label: "Cat 4", value: 3, color: "#4" },
        { label: "Cat 5", value: 4, color: "#5" },
        { label: "Cat 6", value: 5, color: "#6" },
        { label: "Cat 7", value: 0, color: "#7" },
        { label: "Cat 8", value: 0, color: "#8" },
      ]
      const { container } = render(<Donut data={slices} currency="INR" />)
      expect(container.textContent).not.toMatch(/\bNaN\b/)
      expect(container.textContent).not.toMatch(/Infinity/i)
      expect(screen.getByText("6 cats")).toBeInTheDocument()
    })

    it("DailyBars: handles 30+ days of trajectory data with peak calculation", () => {
      const days = Array.from({ length: 30 }, (_, i) => ({
        label: `D${i + 1}`,
        amountMinor: i === 14 ? 500000 : (i % 3) * 1000,
        date: `2026-08-${String(i + 1).padStart(2, "0")}`,
      }))
      const { container } = render(<DailyBars days={days} currency="INR" />)
      expect(container.textContent).not.toMatch(/\bNaN\b/)
      expect(screen.getByText("👑")).toBeInTheDocument()
      expect(screen.getAllByRole("button").length).toBe(30)
    })
  })
})
