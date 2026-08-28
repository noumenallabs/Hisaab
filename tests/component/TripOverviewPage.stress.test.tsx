import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TripOverviewPage } from "@/features/trips/TripOverviewPage"

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => null,
}))

let currentAuthUser: { id: string; name: string; email: string } | null = {
  id: "u_user1",
  name: "User One",
  email: "user1@example.com",
}

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: currentAuthUser }),
}))

let mockTripData: any = {
  id: "t_stress",
  name: "Stress Test Trip",
  destination: "Extreme Locations",
  start_date: "2026-08-20",
  end_date: "2026-08-25",
  base_currency: "INR",
  status: "active",
  created_by: "u_user1",
}

let mockMembers: any[] = []
let mockExpenses: any[] = []
let mockBalances: any[] = []

vi.mock("@/features/trips/hooks", () => ({
  useTrip: vi.fn(() => ({ data: mockTripData, isLoading: false })),
}))

vi.mock("@/features/trips/useMembers", () => ({
  useTripMembers: vi.fn(() => ({ data: mockMembers, isLoading: false })),
}))

vi.mock("@/features/expenses/hooks", () => ({
  useExpenses: vi.fn(() => ({ data: mockExpenses, isLoading: false })),
}))

vi.mock("@/features/balances/hooks", () => ({
  useBalances: vi.fn(() => ({ data: mockBalances, isLoading: false })),
}))

vi.mock("@/features/trips/api", () => ({
  listInvites: vi.fn().mockResolvedValue([]),
  createInvite: vi.fn().mockResolvedValue({ id: "inv-1", code: "TEST123" }),
}))

function renderTripOverview(tripId = "t_stress") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/trips/${tripId}`]}>
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("TripOverviewPage — Empirical Adversarial & Stress Testing", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentAuthUser = {
      id: "u_user1",
      name: "User One",
      email: "user1@example.com",
    }
  })

  // 1. Zero Expenses Edge Condition
  it("handles zero expenses with zero members gracefully without NaN or runtime errors", () => {
    mockTripData = {
      id: "t_zero",
      name: "Empty Trip",
      base_currency: "USD",
      status: "active",
    }
    mockMembers = []
    mockExpenses = []
    mockBalances = []

    const { container } = renderTripOverview("t_zero")

    expect(screen.getByText("Total Spending")).toBeInTheDocument()
    expect(screen.getByText("Avg / Person")).toBeInTheDocument()
    expect(
      screen.getByText("Welcome to your Travel Finance Hub!"),
    ).toBeInTheDocument()
    // Verify no literal NaN text is rendered anywhere in the DOM
    expect(container.textContent).not.toMatch(/\bNaN\b/)
    expect(container.textContent).not.toMatch(/\bundefined\b/)
  })

  // 2. Single Member (Solo Traveler) Edge Condition
  it("handles single member trip with expenses where user is sole payer and split participant", () => {
    mockTripData = {
      id: "t_solo",
      name: "Solo Expedition",
      base_currency: "USD",
      status: "active",
      start_date: "2026-08-20",
    }
    mockMembers = [
      {
        user_id: "u_user1",
        name: "User One",
        email: "user1@example.com",
        role: "owner",
      },
    ]
    mockExpenses = [
      {
        id: "e_solo_1",
        description: "Solo Dinner",
        amount_minor: 4500, // $45.00
        category: "food",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 4500 }],
        expense_splits: [{ user_id: "u_user1", amount_owed_minor: 4500 }],
      },
    ]
    mockBalances = [
      { user_id: "u_user1", paid_minor: 4500, owed_minor: 4500, net_minor: 0 },
    ]

    const { container } = renderTripOverview("t_solo")

    expect(
      screen.getByText("Personal Balance · You're all settled"),
    ).toBeInTheDocument()
    expect(screen.getByText("Settled Up")).toBeInTheDocument()
    const amounts = screen.getAllByText("$45.00")
    expect(amounts.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("🎉 Group is 100% settled up!")).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bNaN\b/)
  })

  // 3. Fully Settled / Zero Balance Multi-User Trip
  it("correctly displays settled state when multiple members have zero net balances", () => {
    mockTripData = {
      id: "t_settled",
      name: "Settled Group",
      base_currency: "EUR",
      status: "active",
      start_date: "2026-08-20",
    }
    mockMembers = [
      { user_id: "u_user1", name: "User One", role: "owner" },
      { user_id: "u_user2", name: "User Two", role: "member" },
    ]
    mockExpenses = [
      {
        id: "e1",
        description: "Lunch",
        amount_minor: 2000,
        category: "food",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 2000 }],
        expense_splits: [
          { user_id: "u_user1", amount_owed_minor: 1000 },
          { user_id: "u_user2", amount_owed_minor: 1000 },
        ],
      },
      {
        id: "e2",
        description: "Dinner",
        amount_minor: 2000,
        category: "food",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user2", amount_paid_minor: 2000 }],
        expense_splits: [
          { user_id: "u_user1", amount_owed_minor: 1000 },
          { user_id: "u_user2", amount_owed_minor: 1000 },
        ],
      },
    ]
    mockBalances = [
      { user_id: "u_user1", paid_minor: 2000, owed_minor: 2000, net_minor: 0 },
      { user_id: "u_user2", paid_minor: 2000, owed_minor: 2000, net_minor: 0 },
    ]

    const { container } = renderTripOverview("t_settled")

    expect(
      screen.getByText("Personal Balance · You're all settled"),
    ).toBeInTheDocument()
    expect(screen.getByText("🎉 Group is 100% settled up!")).toBeInTheDocument()
    const settledBadges = screen.getAllByText("Settled")
    expect(settledBadges.length).toBeGreaterThan(0)
    expect(container.textContent).not.toMatch(/\bNaN\b/)
  })

  // 4. Massive Amounts / Currency Formatting Stress
  it("handles massive amounts (hundreds of millions/billions in minor units) without crashing or overflowing", () => {
    mockTripData = {
      id: "t_massive",
      name: "Luxury Billionaire Cruise",
      base_currency: "INR",
      status: "active",
      start_date: "2026-08-20",
    }
    const massiveAmount = 5000000000000 // ₹50,00,00,000.00 (500 million INR)
    mockMembers = [
      { user_id: "u_user1", name: "User One", role: "owner" },
      { user_id: "u_user2", name: "User Two", role: "member" },
    ]
    mockExpenses = [
      {
        id: "e_superyacht",
        description: "Superyacht charter",
        amount_minor: massiveAmount,
        category: "transport",
        expense_date: "2026-08-20",
        expense_payers: [
          { user_id: "u_user1", amount_paid_minor: massiveAmount },
        ],
        expense_splits: [
          { user_id: "u_user1", amount_owed_minor: massiveAmount / 2 },
          { user_id: "u_user2", amount_owed_minor: massiveAmount / 2 },
        ],
      },
    ]
    mockBalances = [
      {
        user_id: "u_user1",
        paid_minor: massiveAmount,
        owed_minor: massiveAmount / 2,
        net_minor: massiveAmount / 2,
      },
      {
        user_id: "u_user2",
        paid_minor: 0,
        owed_minor: massiveAmount / 2,
        net_minor: -(massiveAmount / 2),
      },
    ]

    const { container } = renderTripOverview("t_massive")

    expect(screen.getByText("Total Spending")).toBeInTheDocument()
    expect(
      screen.getByText("Personal Balance · You are owed"),
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bNaN\b/)
    expect(container.textContent).not.toMatch(/Infinity/i)
  })

  // 5. Extreme Dates & Multi-Year Timeline Stress
  it("handles extreme dates (past, future, pre-start dates, invalid date strings) gracefully", () => {
    mockTripData = {
      id: "t_dates",
      name: "Time Travel Trip",
      base_currency: "USD",
      status: "active",
      start_date: "2026-01-01",
      end_date: "2030-12-31",
    }
    mockMembers = [{ user_id: "u_user1", name: "User One", role: "owner" }]
    mockExpenses = [
      {
        id: "e_pre",
        description: "Early deposit",
        amount_minor: 1000,
        category: "other",
        expense_date: "2025-12-15", // Before start date
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 1000 }],
        expense_splits: [{ user_id: "u_user1", amount_owed_minor: 1000 }],
      },
      {
        id: "e_future",
        description: "Future milestone",
        amount_minor: 2000,
        category: "tickets",
        expense_date: "2029-07-04", // Far future
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 2000 }],
        expense_splits: [{ user_id: "u_user1", amount_owed_minor: 2000 }],
      },
      {
        id: "e_invalid_date",
        description: "Malformed date",
        amount_minor: 3000,
        category: "food",
        expense_date: "invalid-date-string",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 3000 }],
        expense_splits: [{ user_id: "u_user1", amount_owed_minor: 3000 }],
      },
    ]
    mockBalances = []

    const { container } = renderTripOverview("t_dates")

    expect(screen.getByText("Spending Trajectory")).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bNaN\b/)
  })

  // 6. Split Rounding & 1-Cent Expenses (Odd cents)
  it("handles odd 1-cent and fractional remainder splits safely without hanging", () => {
    mockTripData = {
      id: "t_split",
      name: "Pennies Trip",
      base_currency: "USD",
      status: "active",
      start_date: "2026-08-20",
    }
    mockMembers = [
      { user_id: "u_user1", name: "User One", role: "owner" },
      { user_id: "u_user2", name: "User Two", role: "member" },
      { user_id: "u_user3", name: "User Three", role: "member" },
    ]
    // $0.01 total split across 3 people: u1 pays 1 cent, u1 owes 1 cent, others owe 0
    mockExpenses = [
      {
        id: "e_cent",
        description: "1 cent item",
        amount_minor: 1,
        category: "other",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 1 }],
        expense_splits: [
          { user_id: "u_user1", amount_owed_minor: 1 },
          { user_id: "u_user2", amount_owed_minor: 0 },
          { user_id: "u_user3", amount_owed_minor: 0 },
        ],
      },
      // $10.00 split 334, 333, 333
      {
        id: "e_ten",
        description: "$10 lunch",
        amount_minor: 1000,
        category: "food",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 1000 }],
        expense_splits: [
          { user_id: "u_user1", amount_owed_minor: 334 },
          { user_id: "u_user2", amount_owed_minor: 333 },
          { user_id: "u_user3", amount_owed_minor: 333 },
        ],
      },
    ]
    mockBalances = []

    const { container } = renderTripOverview("t_split")

    expect(screen.getByText("Total Spending")).toBeInTheDocument()
    const amounts = screen.getAllByText("$10.01")
    expect(amounts.length).toBeGreaterThanOrEqual(1)
    expect(container.textContent).not.toMatch(/\bNaN\b/)
  })

  // 7. Soft-deleted and 0-amount expenses
  it("ignores soft-deleted expenses in total spend, counts, charts, and member breakdown", () => {
    mockTripData = {
      id: "t_deleted",
      name: "Deleted Expenses Test",
      base_currency: "USD",
      status: "active",
      start_date: "2026-08-20",
    }
    mockMembers = [{ user_id: "u_user1", name: "User One", role: "owner" }]
    mockExpenses = [
      {
        id: "e_active",
        description: "Active Coffee",
        amount_minor: 500,
        category: "food",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 500 }],
        expense_splits: [{ user_id: "u_user1", amount_owed_minor: 500 }],
      },
      {
        id: "e_deleted_flag",
        description: "Deleted Luxury",
        amount_minor: 999900,
        category: "shopping",
        deleted: true,
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 999900 }],
        expense_splits: [{ user_id: "u_user1", amount_owed_minor: 999900 }],
      },
      {
        id: "e_deleted_at",
        description: "Soft Deleted Hotel",
        amount_minor: 500000,
        category: "accommodation",
        deleted_at: "2026-08-20T10:00:00Z",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 500000 }],
        expense_splits: [{ user_id: "u_user1", amount_owed_minor: 500000 }],
      },
    ]
    mockBalances = []

    const { container } = renderTripOverview("t_deleted")

    const coffeeAmounts = screen.getAllByText("$5.00")
    expect(coffeeAmounts.length).toBeGreaterThanOrEqual(1)
    expect(
      screen.getByText("Across 1 recorded transaction"),
    ).toBeInTheDocument()
    expect(screen.queryByText("Deleted Luxury")).not.toBeInTheDocument()
    expect(screen.queryByText("Soft Deleted Hotel")).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bNaN\b/)
  })

  // 8. Archived and Settled Trip State Restrictions
  it("enforces read-only state banner for archived trips and hides header action buttons", () => {
    mockTripData = {
      id: "t_archived",
      name: "Archived Expedition",
      base_currency: "USD",
      status: "archived",
    }
    mockMembers = [{ user_id: "u_user1", name: "User One", role: "owner" }]
    mockExpenses = [
      {
        id: "e1",
        description: "Past hotel",
        amount_minor: 10000,
        category: "accommodation",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 10000 }],
        expense_splits: [{ user_id: "u_user1", amount_owed_minor: 10000 }],
      },
    ]
    mockBalances = [
      {
        user_id: "u_user1",
        paid_minor: 10000,
        owed_minor: 10000,
        net_minor: 0,
      },
    ]

    renderTripOverview("t_archived")

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Archived trip — read-only mode.",
    )
    expect(
      screen.queryByRole("link", { name: /Add new expense/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Settle debts/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Invite traveler/i }),
    ).not.toBeInTheDocument()
  })

  // 9. Unknown / Unmapped Categories
  it("falls back gracefully for unknown expense categories in charts and summaries", () => {
    mockTripData = {
      id: "t_cat",
      name: "Custom Category Trip",
      base_currency: "USD",
      status: "active",
      start_date: "2026-08-20",
    }
    mockMembers = [{ user_id: "u_user1", name: "User One", role: "owner" }]
    mockExpenses = [
      {
        id: "e_custom",
        description: "Crypto Gas Fee",
        amount_minor: 2500,
        category: "cryptocurrency_blockchain", // Unknown category
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 2500 }],
        expense_splits: [{ user_id: "u_user1", amount_owed_minor: 2500 }],
      },
    ]
    mockBalances = []

    const { container } = renderTripOverview("t_cat")

    expect(screen.getByText("Spending by Category")).toBeInTheDocument()
    expect(screen.getByText(/Other/i)).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bNaN\b/)
  })

  // 10. JPY and zero-decimal currency handling
  it("formats zero-decimal currencies like JPY correctly without decimal points", () => {
    mockTripData = {
      id: "t_jpy",
      name: "Tokyo Trip",
      base_currency: "JPY",
      status: "active",
      start_date: "2026-08-20",
    }
    mockMembers = [{ user_id: "u_user1", name: "User One", role: "owner" }]
    mockExpenses = [
      {
        id: "e_ramen",
        description: "Ichiran Ramen",
        amount_minor: 1200, // 1200 JPY
        category: "food",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 1200 }],
        expense_splits: [{ user_id: "u_user1", amount_owed_minor: 1200 }],
      },
    ]
    mockBalances = [
      { user_id: "u_user1", paid_minor: 1200, owed_minor: 1200, net_minor: 0 },
    ]

    const { container } = renderTripOverview("t_jpy")

    const yenElements = screen.getAllByText("¥1,200")
    expect(yenElements.length).toBeGreaterThanOrEqual(1)
    expect(container.textContent).not.toMatch(/¥1,200\.00/)
    expect(container.textContent).not.toMatch(/\bNaN\b/)
  })

  // 11. User not in member list / Unauthenticated / Non-member viewing trip
  it("renders overview gracefully when current user is not a member of the trip", () => {
    currentAuthUser = {
      id: "u_outsider",
      name: "Outsider",
      email: "outsider@example.com",
    }
    mockTripData = {
      id: "t_public",
      name: "Public View Trip",
      base_currency: "USD",
      status: "active",
      start_date: "2026-08-20",
    }
    mockMembers = [
      { user_id: "u_user1", name: "User One", role: "owner" },
      { user_id: "u_user2", name: "User Two", role: "member" },
    ]
    mockExpenses = [
      {
        id: "e1",
        description: "Tour",
        amount_minor: 5000,
        category: "tickets",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 5000 }],
        expense_splits: [
          { user_id: "u_user1", amount_owed_minor: 2500 },
          { user_id: "u_user2", amount_owed_minor: 2500 },
        ],
      },
    ]
    mockBalances = [
      {
        user_id: "u_user1",
        paid_minor: 5000,
        owed_minor: 2500,
        net_minor: 2500,
      },
      { user_id: "u_user2", paid_minor: 0, owed_minor: 2500, net_minor: -2500 },
    ]

    const { container } = renderTripOverview("t_public")

    // Personal Standing banner should NOT render for an outsider not in balanceRows
    expect(screen.queryByText(/Personal Balance ·/)).not.toBeInTheDocument()
    expect(screen.getByText("Total Spending")).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bNaN\b/)
  })

  // 12. Unbalanced fallback split derivation when Supabase is offline / no balances RPC
  it("calculates fallback balances and debt simplification accurately when balances RPC is empty", () => {
    mockTripData = {
      id: "t_fallback",
      name: "Offline Math Trip",
      base_currency: "USD",
      status: "active",
      start_date: "2026-08-20",
    }
    mockMembers = [
      { user_id: "u_user1", name: "User One", role: "owner" },
      { user_id: "u_user2", name: "User Two", role: "member" },
    ]
    // u1 paid $100 for both ($50 each). balances array is EMPTY.
    mockExpenses = [
      {
        id: "e1",
        description: "Cab ride",
        amount_minor: 10000,
        category: "transport",
        expense_date: "2026-08-20",
        expense_payers: [{ user_id: "u_user1", amount_paid_minor: 10000 }],
        expense_splits: [
          { user_id: "u_user1", amount_owed_minor: 5000 },
          { user_id: "u_user2", amount_owed_minor: 5000 },
        ],
      },
    ]
    mockBalances = [] // RPC returns empty array

    const { container } = renderTripOverview("t_fallback")

    // User One is owed $50.00
    expect(
      screen.getByText("Personal Balance · You are owed"),
    ).toBeInTheDocument()
    const owedAmounts = screen.getAllByText("$50.00")
    expect(screen.getByText("+$50.00")).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\bNaN\b/)
  })
})
