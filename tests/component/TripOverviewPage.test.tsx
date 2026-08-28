import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TripOverviewPage } from "@/features/trips/TripOverviewPage"

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => null,
}))

const mockAuthUser = {
  id: "u_arun",
  name: "Arun Menon",
  email: "arun@example.com",
}
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mockAuthUser }),
}))

const mockTripData = {
  id: "t_goa",
  name: "Goa Vacation",
  destination: "Goa, India",
  start_date: "2026-08-20",
  end_date: "2026-08-25",
  base_currency: "INR",
  status: "active",
  created_by: "u_arun",
}

const mockMembers = [
  {
    user_id: "u_arun",
    name: "Arun Menon",
    email: "arun@example.com",
    role: "owner",
  },
  {
    user_id: "u_sneha",
    name: "Sneha Rao",
    email: "sneha@example.com",
    role: "member",
  },
  {
    user_id: "u_dev",
    name: "Dev Patel",
    email: "dev@example.com",
    role: "member",
  },
]

const mockExpenses = [
  {
    id: "e1",
    description: "Beach Villa Stay",
    amount_minor: 1500000,
    category: "accommodation",
    expense_date: "2026-08-20",
    expense_payers: [{ user_id: "u_arun", amount_paid_minor: 1500000 }],
    expense_splits: [
      { user_id: "u_arun", amount_owed_minor: 500000 },
      { user_id: "u_sneha", amount_owed_minor: 500000 },
      { user_id: "u_dev", amount_owed_minor: 500000 },
    ],
  },
  {
    id: "e2",
    description: "Seafood Shack",
    amount_minor: 600000,
    category: "food",
    expense_date: "2026-08-21",
    expense_payers: [{ user_id: "u_sneha", amount_paid_minor: 600000 }],
    expense_splits: [
      { user_id: "u_arun", amount_owed_minor: 200000 },
      { user_id: "u_sneha", amount_owed_minor: 200000 },
      { user_id: "u_dev", amount_owed_minor: 200000 },
    ],
  },
]

const mockBalances = [
  {
    user_id: "u_arun",
    paid_minor: 1500000,
    owed_minor: 700000,
    net_minor: 800000,
  },
  {
    user_id: "u_sneha",
    paid_minor: 600000,
    owed_minor: 700000,
    net_minor: -100000,
  },
  { user_id: "u_dev", paid_minor: 0, owed_minor: 700000, net_minor: -700000 },
]

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
  listInvites: vi.fn().mockResolvedValue([
    {
      id: "inv-1",
      code: "GOA2026",
      is_active: true,
      expires_at: "2026-09-20T00:00:00Z",
      use_count: 0,
      max_uses: null,
    },
  ]),
  createInvite: vi.fn().mockResolvedValue({ id: "inv-2", code: "NEW123" }),
}))

function renderTripOverview(tripId = "t_goa") {
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

describe("TripOverviewPage - Travel Finance Hub", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders trip header details and action buttons", () => {
    renderTripOverview()
    expect(
      screen.getByRole("heading", { name: "Goa Vacation", level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Goa, India/)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /Add new expense/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Settle debts/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Invite traveler/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: /Share trip summary/i }),
    ).toBeInTheDocument()
  })

  it("renders asymmetric metric cards hierarchy with totals and counts", () => {
    renderTripOverview()
    expect(screen.getByText("Total Spending")).toBeInTheDocument()
    expect(screen.getByText("Avg / Person")).toBeInTheDocument()
    expect(screen.getByText("Expenses")).toBeInTheDocument()
    expect(screen.getByText("Members")).toBeInTheDocument()
    expect(
      screen.getByText(/Across 2 recorded transactions/),
    ).toBeInTheDocument()
  })

  it("renders personal standing hero banner when user is owed money", () => {
    renderTripOverview()
    expect(
      screen.getByText(/Personal Balance · You are owed/i),
    ).toBeInTheDocument()
    expect(screen.getByText("₹8,000.00")).toBeInTheDocument()
  })

  it("renders daily spending trajectory widget", () => {
    renderTripOverview()
    expect(screen.getByText("Spending Trajectory")).toBeInTheDocument()
    expect(screen.getByText(/Day-by-day burn rate/)).toBeInTheDocument()
    expect(screen.getByText(/Peak:/)).toBeInTheDocument()
    expect(screen.getByText(/Avg:/)).toBeInTheDocument()
  })

  it("renders interactive category spending section with Donut chart and breakdown pills", () => {
    renderTripOverview()
    expect(screen.getByText("Spending by Category")).toBeInTheDocument()
    expect(screen.getAllByText(/Stay/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Food/).length).toBeGreaterThan(0)
  })

  it("renders member financial breakdown with paid, share, and net badges", () => {
    renderTripOverview()
    expect(screen.getByText(/Member Breakdown/)).toBeInTheDocument()
    expect(screen.getAllByText("Arun Menon").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Sneha Rao").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Dev Patel").length).toBeGreaterThan(0)
    expect(screen.getByText("+₹8,000.00")).toBeInTheDocument()
  })

  it("opens invite traveler modal when Invite button is clicked", async () => {
    const user = userEvent.setup()
    renderTripOverview()
    const inviteBtn = screen.getByRole("button", { name: /Invite traveler/i })
    await user.click(inviteBtn)
    expect(
      await screen.findByRole("dialog", { name: /Invite Travelers/i }),
    ).toBeInTheDocument()
    expect(screen.getByText("Active Trip Invite Code")).toBeInTheDocument()
  })

  it("opens share trip summary modal when Share button is clicked", async () => {
    const user = userEvent.setup()
    renderTripOverview()
    const shareBtn = screen.getByRole("button", { name: /Share trip summary/i })
    await user.click(shareBtn)
    expect(
      await screen.findByRole("dialog", { name: /Share Trip Summary/i }),
    ).toBeInTheDocument()
  })

  it("opens settlement dialog when Settle up quick action is clicked", async () => {
    const user = userEvent.setup()
    renderTripOverview()
    const settleBtn = screen.getByRole("button", { name: /Settle debts/i })
    await user.click(settleBtn)
    expect(
      await screen.findByRole("dialog", { name: /Record settlement/i }),
    ).toBeInTheDocument()
  })

  it("renders onboarding checklist empty state when trip has 0 expenses", async () => {
    const { useExpenses } = await import("@/features/expenses/hooks")
    vi.mocked(useExpenses).mockReturnValueOnce({
      data: [],
      isLoading: false,
    } as any)
    const { useBalances } = await import("@/features/balances/hooks")
    vi.mocked(useBalances).mockReturnValueOnce({
      data: [],
      isLoading: false,
    } as any)

    renderTripOverview()
    expect(
      screen.getByText("Welcome to your Travel Finance Hub!"),
    ).toBeInTheDocument()
    expect(screen.getByText("Invite your crew")).toBeInTheDocument()
    expect(screen.getByText("Add your first expense")).toBeInTheDocument()
    expect(screen.getByText("Track & Settle with 0 math")).toBeInTheDocument()
  })
})
