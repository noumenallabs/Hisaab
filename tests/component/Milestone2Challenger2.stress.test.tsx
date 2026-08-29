import { describe, it, expect, beforeEach, vi } from "vitest"
import React from "react"
import { render, screen, fireEvent, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  formatMinor,
  toMinor,
  fromMinor,
  parseCurrencyInput,
  decimalsFor,
} from "@/lib/currency"
import {
  allocateEqual,
  allocatePercent,
  allocateShares,
  allocateExact,
} from "@/features/expenses/money"
import { netBalances, simplifyDebts } from "@/features/balances/balanceMath"
import { CurrencyAmount } from "@/components/finance/CurrencyAmount"
import { BalanceRow } from "@/components/finance/BalanceRow"
import { ExpenseRow } from "@/components/finance/ExpenseRow"
import { DailyBreakdown } from "@/features/balances/DailyBreakdown"
import { CategoryBreakdown } from "@/features/balances/CategoryBreakdown"
import { ThemeProvider, useTheme } from "@/lib/theme"

function renderWithProviders(ui: React.ReactElement, initialRoute = "/") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

describe("Challenger 2 — Financial Math, Tabular Alignments & Motion Verification", () => {
  describe("1. Multi-Payer Split Math, Rounding & Conservation of Money", () => {
    it("allocateEqual: preserves total amount with integer minor unit integrity under odd splits", () => {
      // 3-way split of 100 paise -> 34, 33, 33 (sum = 100)
      const split100_3 = allocateEqual(100, 3)
      expect(split100_3).toEqual([34, 33, 33])
      expect(split100_3.reduce((a, b) => a + b, 0)).toBe(100)

      // 7-way split of 100 paise -> 15, 15, 14, 14, 14, 14, 14 (sum = 100)
      const split100_7 = allocateEqual(100, 7)
      expect(split100_7).toEqual([15, 15, 14, 14, 14, 14, 14])
      expect(split100_7.reduce((a, b) => a + b, 0)).toBe(100)

      // 3-way split of 1 paisa -> 1, 0, 0 (sum = 1)
      const split1_3 = allocateEqual(1, 3)
      expect(split1_3).toEqual([1, 0, 0])
      expect(split1_3.reduce((a, b) => a + b, 0)).toBe(1)

      // 0 paise split 5 ways -> [0, 0, 0, 0, 0]
      const split0_5 = allocateEqual(0, 5)
      expect(split0_5).toEqual([0, 0, 0, 0, 0])
      expect(split0_5.reduce((a, b) => a + b, 0)).toBe(0)

      // 0 or negative count returns empty array
      expect(allocateEqual(100, 0)).toEqual([])
      expect(allocateEqual(100, -2)).toEqual([])
    })

    it("allocateEqual: Property / Fuzz stress testing 1000 random inputs", () => {
      for (let i = 0; i < 1000; i++) {
        const total = Math.floor(Math.random() * 10000000) // Up to 100,000.00
        const count = Math.floor(Math.random() * 50) + 1 // 1 to 50 people
        const res = allocateEqual(total, count)
        expect(res.length).toBe(count)
        const sum = res.reduce((a, b) => a + b, 0)
        expect(sum).toBe(total)
        const max = Math.max(...res)
        const min = Math.min(...res)
        expect(max - min).toBeLessThanOrEqual(1)
      }
    })

    it("allocatePercent: enforces 100% sum and implements Hare-Niemeyer largest remainder distribution", () => {
      // 3-way equal percent 33.33%, 33.33%, 33.34% of 10000 paise (₹100)
      const res = allocatePercent(10000, [33.33, 33.33, 33.34])
      expect(res).not.toBeNull()
      expect(res!.reduce((a, b) => a + b, 0)).toBe(10000)

      // Reject sum != 100
      expect(allocatePercent(10000, [50, 49.9])).toBeNull()
      expect(allocatePercent(10000, [50, 50.1])).toBeNull()

      // Reject negative percentages
      expect(allocatePercent(10000, [-10, 110])).toBeNull()

      // Empty input
      expect(allocatePercent(10000, [])).toBeNull()

      // Zero allocation for some participants
      const zeroAlloc = allocatePercent(10000, [100, 0, 0])
      expect(zeroAlloc).toEqual([10000, 0, 0])
      expect(zeroAlloc!.reduce((a, b) => a + b, 0)).toBe(10000)
    })

    it("allocateShares: distributes integer minor units proportionally and conserves total", () => {
      // 1:2:3 shares on 1000 paise (total 6 shares)
      // 1000 * 1/6 = 166.66 -> 167
      // 1000 * 2/6 = 333.33 -> 333
      // 1000 * 3/6 = 500.00 -> 500
      const res = allocateShares(1000, [1, 2, 3])
      expect(res).not.toBeNull()
      expect(res!.reduce((a, b) => a + b, 0)).toBe(1000)
      expect(res).toEqual([167, 333, 500])

      // Negative or all zero shares rejected
      expect(allocateShares(1000, [0, 0, 0])).toBeNull()
      expect(allocateShares(1000, [-1, 2])).toBeNull()
      expect(allocateShares(1000, [])).toBeNull()
    })

    it("allocateExact: verifies exact integer minor units sum match", () => {
      expect(allocateExact(1000, [300, 700])).toEqual([300, 700])
      expect(allocateExact(1000, [300, 699])).toBeNull()
      expect(allocateExact(1000, [300, 701])).toBeNull()
    })
  })

  describe("2. Debt Simplification & Net Balances Conservation", () => {
    it("netBalances & simplifyDebts: 5-party circular debt simplifies to zero transfers", () => {
      // Circular: A pays for B, B pays for C, C pays for D, D pays for E, E pays for A (each 1000)
      const expenses = [
        { payers: [{ userId: "A", amount: 1000 }], splits: [{ userId: "B", amount: 1000 }] },
        { payers: [{ userId: "B", amount: 1000 }], splits: [{ userId: "C", amount: 1000 }] },
        { payers: [{ userId: "C", amount: 1000 }], splits: [{ userId: "D", amount: 1000 }] },
        { payers: [{ userId: "D", amount: 1000 }], splits: [{ userId: "E", amount: 1000 }] },
        { payers: [{ userId: "E", amount: 1000 }], splits: [{ userId: "A", amount: 1000 }] },
      ]
      const memberIds = ["A", "B", "C", "D", "E"]
      const net = netBalances(expenses, [], memberIds)

      // All net balances must be strictly 0
      for (const id of memberIds) {
        expect(net[id]).toBe(0)
      }

      const transfers = simplifyDebts(net)
      expect(transfers).toEqual([])
    })

    it("simplifyDebts: minimizes transactions and ensures conservation of net transfers", () => {
      // Net positions: A: +3000, B: +2000, C: -1000, D: -4000
      const net = { A: 3000, B: 2000, C: -1000, D: -4000 }
      const transfers = simplifyDebts(net)

      // Transfers should be at most 3 (<= creditors + debtors - 1)
      expect(transfers.length).toBeLessThanOrEqual(3)

      // Sum of transferred amounts must equal total positive balance (5000)
      const totalTransferred = transfers.reduce((s, t) => s + t.amount, 0)
      expect(totalTransferred).toBe(5000)

      // Verify each transfer debtor and creditor
      for (const t of transfers) {
        expect(["C", "D"]).toContain(t.fromId)
        expect(["A", "B"]).toContain(t.toId)
        expect(t.amount).toBeGreaterThan(0)
      }
    })
  })

  describe("3. Currency Helpers, Decimals & Formatting Integrity", () => {
    it("decimalsFor: returns 0 for JPY, 2 for INR/USD/EUR/GBP/AED/SGD, defaults to 2", () => {
      expect(decimalsFor("JPY")).toBe(0)
      expect(decimalsFor("INR")).toBe(2)
      expect(decimalsFor("USD")).toBe(2)
      expect(decimalsFor("EUR")).toBe(2)
      expect(decimalsFor("GBP")).toBe(2)
      expect(decimalsFor("AED")).toBe(2)
      expect(decimalsFor("SGD")).toBe(2)
      expect(decimalsFor("UNKNOWN")).toBe(2)
    })

    it("toMinor & fromMinor: precise conversion without floating point artifacts", () => {
      expect(toMinor(12.34, 2)).toBe(1234)
      expect(toMinor(100, 0)).toBe(100)
      expect(fromMinor(1234, 2)).toBe(12.34)
      expect(fromMinor(100, 0)).toBe(100)
      expect(fromMinor(NaN as any, 2)).toBe(0)
    })

    it("parseCurrencyInput: parses valid values and rejects inputs exceeding allowed decimal precision", () => {
      expect(parseCurrencyInput("1,250.50", "INR")).toBe(125050)
      expect(parseCurrencyInput("1000", "JPY")).toBe(1000)
      expect(parseCurrencyInput("10.5", "JPY")).toBeNull() // JPY has 0 decimals
      expect(parseCurrencyInput("10.555", "INR")).toBeNull() // INR has 2 decimals, 3 rejected
      expect(parseCurrencyInput("", "INR")).toBeNull()
      expect(parseCurrencyInput(".", "INR")).toBeNull()
      expect(parseCurrencyInput("abc", "INR")).toBeNull()
    })

    it("formatMinor: formats major amounts cleanly in various currencies", () => {
      const formattedINR = formatMinor(1420000, "INR", "en-IN")
      expect(formattedINR).toContain("14,200.00")

      const formattedUSD = formatMinor(5000, "USD", "en-US")
      expect(formattedUSD).toContain("50.00")

      const formattedJPY = formatMinor(1000, "JPY", "ja-JP")
      expect(formattedJPY).toContain("1,000")
      expect(formattedJPY).not.toContain(".00") // No fractional cents for JPY
    })
  })

  describe("4. Tabular Numeral Application (.tnum font-mono) across UI Components", () => {
    it("CurrencyAmount: renders with .tnum font-mono and calibrated tone colors", () => {
      const { container } = render(
        <CurrencyAmount minor={1420000} currency="INR" tone="owed" />
      )
      const span = container.querySelector("span")
      expect(span).toBeInTheDocument()
      expect(span).toHaveClass("tnum")
      expect(span).toHaveClass("font-mono")
      expect(span).toHaveClass("text-owed")
    })

    it("BalanceRow: formats paid, share, and net in .tnum font-mono", () => {
      const { container } = render(
        <BalanceRow
          userId="u_1"
          name="Viru"
          paid={10000}
          owed={6000}
          net={4000}
          currency="INR"
        />
      )
      const subheadline = container.querySelector(".text-ink-soft")
      expect(subheadline).toHaveClass("tnum")
      expect(subheadline).toHaveClass("font-mono")
      expect(subheadline?.textContent).toContain("paid")
      expect(subheadline?.textContent).toContain("share")

      const netAmount = container.querySelector(".text-owed")
      expect(netAmount).toHaveClass("tnum")
      expect(netAmount).toHaveClass("font-mono")
    })

    it("ExpenseRow: renders amounts and myContribution in font-mono / CurrencyAmount", () => {
      render(
        <MemoryRouter>
          <ExpenseRow
            expense={{
              id: "e_1",
              description: "Beach Dinner",
              category: "food",
              amount_minor: 4500,
              currency: "INR",
              expense_date: "2026-08-20",
            }}
            tripId="t_1"
            myContribution={1500}
            currency="INR"
          />
        </MemoryRouter>
      )

      expect(screen.getByText(/you paid/i)).toBeInTheDocument()
      const contribSpan = screen.getByText(/you paid/i)
      expect(contribSpan).toHaveClass("font-mono")
    })
  })

  describe("5. Accordion Motion Stability: Zero-Popping CSS Grid Expansion", () => {
    const mockTimeline = [
      {
        date: "2026-08-20",
        label: "Day 1 (Aug 20, 2026)",
        dayNumber: 1,
        expenseCount: 2,
        totalMinor: 8000,
        payerMap: { u_1: 8000, u_2: 0 },
        isSettled: false,
        transfers: [{ fromId: "u_2", toId: "u_1", amount: 4000 }],
      },
    ]
    const memberMap = new Map([
      ["u_1", "Viru"],
      ["u_2", "Tejo"],
    ])

    it("DailyBreakdown: uses data-expanded with CSS grid-rows-[0fr] to grid-rows-[1fr] transition", async () => {
      const user = userEvent.setup()
      const onSettle = vi.fn()

      const { container } = render(
        <DailyBreakdown
          timeline={mockTimeline}
          currency="INR"
          memberMap={memberMap}
          currentUserId="u_1"
          onSettle={onSettle}
        />
      )

      const accordionRegion = container.querySelector("#day-content-2026-08-20")
      expect(accordionRegion).toBeInTheDocument()
      // Initial state: first 2 days are expanded by default
      expect(accordionRegion).toHaveAttribute("data-expanded", "true")
      expect(accordionRegion).toHaveClass("grid")
      expect(accordionRegion?.className).toContain("grid-rows-[0fr]")
      expect(accordionRegion?.className).toContain("data-[expanded=true]:grid-rows-[1fr]")
      expect(accordionRegion?.className).toContain("transition-[grid-template-rows]")
      expect(accordionRegion?.className).toContain("duration-250")
      expect(accordionRegion?.className).toContain("ease-spring")
      expect(accordionRegion?.className).toContain("overflow-hidden")

      // Inner container must have min-h-0 overflow-hidden to prevent layout popping
      const innerContainer = accordionRegion?.firstElementChild
      expect(innerContainer).toHaveClass("min-h-0")
      expect(innerContainer).toHaveClass("overflow-hidden")

      // Click header trigger to toggle collapse
      const headerButton = container.querySelector("#day-header-2026-08-20")!
      await user.click(headerButton)

      expect(accordionRegion).toHaveAttribute("data-expanded", "false")
      expect(headerButton).toHaveAttribute("aria-expanded", "false")
    })

    it("CategoryBreakdown: uses data-expanded with CSS grid-rows-[0fr] to grid-rows-[1fr] transition", async () => {
      const user = userEvent.setup()
      const mockExpenses = [
        {
          id: "e_1",
          description: "Pizza Dinner",
          category: "food",
          amount_minor: 4000,
          expense_payers: [{ user_id: "u_1", amount_paid_minor: 4000 }],
          expense_splits: [
            { user_id: "u_1", amount_owed_minor: 2000 },
            { user_id: "u_2", amount_owed_minor: 2000 },
          ],
        },
      ]
      const members = [
        { id: "u_1", name: "Viru" },
        { id: "u_2", name: "Tejo" },
      ]

      const { container } = render(
        <CategoryBreakdown
          expenses={mockExpenses}
          members={members}
          currentUserId="u_1"
          baseCurrency="INR"
        />
      )

      const accordionRegion = container.querySelector("#category-breakdown-content")
      expect(accordionRegion).toBeInTheDocument()
      expect(accordionRegion).toHaveAttribute("data-expanded", "true")
      expect(accordionRegion).toHaveClass("grid")
      expect(accordionRegion?.className).toContain("grid-rows-[0fr]")
      expect(accordionRegion?.className).toContain("data-[expanded=true]:grid-rows-[1fr]")
      expect(accordionRegion?.className).toContain("transition-[grid-template-rows]")
      expect(accordionRegion?.className).toContain("duration-250")
      expect(accordionRegion?.className).toContain("ease-spring")
      expect(accordionRegion?.className).toContain("overflow-hidden")

      // Toggle collapse
      const toggleBtn = screen.getByLabelText("Collapse breakdown")
      await user.click(toggleBtn)

      expect(accordionRegion).toHaveAttribute("data-expanded", "false")
      expect(toggleBtn).toHaveAttribute("aria-expanded", "false")
    })
  })

  describe("6. Theme DOM Switching & Design Tokens", () => {
    function ThemeTestComponent() {
      const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme()
      return (
        <div>
          <span data-testid="theme-val">{theme}</span>
          <span data-testid="resolved-val">{resolvedTheme}</span>
          <button onClick={() => setTheme("dark")}>Dark</button>
          <button onClick={() => setTheme("light")}>Light</button>
          <button onClick={toggleTheme}>Toggle</button>
        </div>
      )
    }

    it("switches theme and updates documentElement classes without layout disruption", async () => {
      const user = userEvent.setup()
      render(
        <ThemeProvider>
          <ThemeTestComponent />
        </ThemeProvider>
      )

      await user.click(screen.getByText("Dark"))
      expect(screen.getByTestId("resolved-val").textContent).toBe("dark")
      expect(document.documentElement.classList.contains("dark")).toBe(true)
      expect(document.documentElement.classList.contains("light")).toBe(false)

      await user.click(screen.getByText("Light"))
      expect(screen.getByTestId("resolved-val").textContent).toBe("light")
      expect(document.documentElement.classList.contains("light")).toBe(true)
      expect(document.documentElement.classList.contains("dark")).toBe(false)
    })
  })
})
