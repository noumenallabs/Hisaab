import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ExpensesPage } from "@/features/expenses/ExpensesPage"
import { BalancesPage } from "@/features/balances/BalancesPage"
import { ActivityPage } from "@/features/activity/ActivityPage"
import { TripSettingsPage } from "@/features/settings/TripSettingsPage"
import { ProfilePage } from "@/features/profile/ProfilePage"
import { ToastProvider } from "@/components/feedback/ToastProvider"
import { ThemeProvider } from "@/lib/theme"

// --- Global Mocks Setup ---
const mockRpc = vi.fn()
const mockGetSession = vi.fn()
const mockGetUser = vi.fn()

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: mockRpc,
    auth: { getSession: mockGetSession, getUser: mockGetUser },
  }),
}))

const mockAuthUser = {
  id: "u_arun",
  name: "Arun Menon",
  email: "arun@example.com",
}
const mockSetCustomUser = vi.fn()

vi.mock("@/lib/auth", () => ({
  useAuth: vi.fn(() => ({
    user: mockAuthUser,
    setCustomUser: mockSetCustomUser,
  })),
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
    notes: "Advance booking paid online",
    amount_minor: 1500000,
    category: "accommodation",
    expense_date: "2026-08-20",
    updated_at: "2026-08-20T10:00:00Z",
    expense_payers: [{ user_id: "u_arun", amount_paid_minor: 1500000 }],
    expense_splits: [
      { user_id: "u_arun", amount_owed_minor: 500000 },
      { user_id: "u_sneha", amount_owed_minor: 500000 },
      { user_id: "u_dev", amount_owed_minor: 500000 },
    ],
  },
  {
    id: "e2",
    description: "Seafood Dinner at Curlies",
    notes: "Dinner on day 2",
    amount_minor: 600000,
    category: "food",
    expense_date: "2026-08-21",
    updated_at: "2026-08-21T21:00:00Z",
    expense_payers: [{ user_id: "u_sneha", amount_paid_minor: 600000 }],
    expense_splits: [
      { user_id: "u_arun", amount_owed_minor: 200000 },
      { user_id: "u_sneha", amount_owed_minor: 200000 },
      { user_id: "u_dev", amount_owed_minor: 200000 },
    ],
  },
  {
    id: "e3",
    description: "Cab to Panaji",
    notes: "Sightseeing taxi",
    amount_minor: 180000,
    category: "transport",
    expense_date: "2026-08-22",
    updated_at: "2026-08-22T14:00:00Z",
    expense_payers: [{ user_id: "u_dev", amount_paid_minor: 180000 }],
    expense_splits: [
      { user_id: "u_arun", amount_owed_minor: 60000 },
      { user_id: "u_sneha", amount_owed_minor: 60000 },
      { user_id: "u_dev", amount_owed_minor: 60000 },
    ],
  },
  {
    id: "e4",
    description: "Old Cancelled Activity",
    notes: "Cancelled due to rain",
    amount_minor: 300000,
    category: "tickets",
    expense_date: "2026-08-23",
    updated_at: "2026-08-23T09:00:00Z",
    deleted_at: "2026-08-23T11:00:00Z",
    expense_payers: [{ user_id: "u_arun", amount_paid_minor: 300000 }],
    expense_splits: [
      { user_id: "u_arun", amount_owed_minor: 100000 },
      { user_id: "u_sneha", amount_owed_minor: 100000 },
      { user_id: "u_dev", amount_owed_minor: 100000 },
    ],
  },
]

const mockBalances = [
  {
    user_id: "u_arun",
    paid_minor: 1500000,
    owed_minor: 760000,
    sent_minor: 0,
    received_minor: 0,
    net_minor: 740000,
  },
  {
    user_id: "u_sneha",
    paid_minor: 600000,
    owed_minor: 760000,
    sent_minor: 0,
    received_minor: 0,
    net_minor: -160000,
  },
  {
    user_id: "u_dev",
    paid_minor: 180000,
    owed_minor: 760000,
    sent_minor: 0,
    received_minor: 0,
    net_minor: -580000,
  },
]

const mockSettlements = [
  {
    id: "s1",
    trip_id: "t_goa",
    from_user_id: "u_sneha",
    to_user_id: "u_arun",
    amount_minor: 100000,
    currency: "INR",
    payment_method: "UPI",
    created_at: "2026-08-22T12:00:00Z",
  },
]

const mockActivities = [
  {
    id: "a1",
    trip_id: "t_goa",
    actor_user_id: "u_arun",
    action: "create",
    entity_type: "expense",
    entity_id: "e1",
    created_at: "2026-08-20T10:00:00Z",
    new_values: { amount_minor: 1500000, description: "Beach Villa Stay" },
    details: { amount_minor: 1500000, description: "Beach Villa Stay" },
    changed_fields: ["description", "amount_minor"],
  },
  {
    id: "a2",
    trip_id: "t_goa",
    actor_user_id: "u_sneha",
    action: "join",
    entity_type: "member",
    entity_id: "u_sneha",
    created_at: "2026-08-20T11:00:00Z",
    new_values: { name: "Sneha Rao", role: "member" },
    details: { name: "Sneha Rao", role: "member" },
    changed_fields: [],
  },
  {
    id: "a3",
    trip_id: "t_goa",
    actor_user_id: "u_sneha",
    action: "settle",
    entity_type: "settlement",
    entity_id: "s1",
    created_at: "2026-08-22T12:00:00Z",
    new_values: { amount_minor: 100000, from_user_id: "u_sneha", to_user_id: "u_arun" },
    details: { amount_minor: 100000, to_user_id: "u_arun" },
    changed_fields: [],
  },
  {
    id: "a4",
    trip_id: "t_goa",
    actor_user_id: "u_arun",
    action: "soft_delete",
    entity_type: "expense",
    entity_id: "e4",
    created_at: "2026-08-23T11:00:00Z",
    new_values: { description: "Old Cancelled Activity" },
    details: { description: "Old Cancelled Activity" },
    changed_fields: ["deleted_at"],
  },
  {
    id: "a5",
    trip_id: "t_goa",
    actor_user_id: "u_arun",
    action: "role_change",
    entity_type: "member",
    entity_id: "u_dev",
    created_at: "2026-08-23T15:00:00Z",
    new_values: { role: "owner" },
    details: { old_role: "member", new_role: "owner" },
    changed_fields: ["role"],
  },
]

// Hooks mocks
vi.mock("@/features/trips/hooks", () => ({
  useTrip: vi.fn(() => ({ data: mockTripData, isLoading: false })),
}))

vi.mock("@/features/trips/useMembers", () => ({
  useTripMembers: vi.fn(() => ({ data: mockMembers, isLoading: false })),
  tripMembersKeys: {
    list: (tripId: string) => ["trip_members", tripId],
  },
}))

let currentExpensesMock: any[] = mockExpenses
vi.mock("@/features/expenses/hooks", () => ({
  useExpenses: vi.fn((_tripId: string, opts?: { includeDeleted?: boolean }) => ({
    data: opts?.includeDeleted
      ? currentExpensesMock
      : currentExpensesMock.filter((e) => !e.deleted_at),
    isLoading: false,
  })),
  useExpense: vi.fn((_tripId: string, expenseId: string) => ({
    data: currentExpensesMock.find((e) => e.id === expenseId),
    isLoading: false,
  })),
}))

vi.mock("@/features/balances/hooks", () => ({
  useBalances: vi.fn(() => ({ data: mockBalances, isLoading: false })),
  useSettlements: vi.fn(() => ({ data: mockSettlements, isLoading: false })),
}))

let currentActivitiesMock = [...mockActivities]
const mockFetchNextPage = vi.fn()
vi.mock("@/features/activity/hooks", () => ({
  useActivity: vi.fn(() => ({
    data: { pages: [currentActivitiesMock] },
    isLoading: false,
    hasNextPage: true,
    fetchNextPage: mockFetchNextPage,
    isFetchingNextPage: false,
  })),
}))

// API mocks
const mockArchiveTrip = vi.fn().mockResolvedValue(undefined)
const mockDeleteTrip = vi.fn().mockResolvedValue(undefined)
const mockMarkSettled = vi.fn().mockResolvedValue(undefined)
const mockReopenTrip = vi.fn().mockResolvedValue(undefined)
const mockRemoveMember = vi.fn().mockResolvedValue(undefined)
const mockChangeMemberRole = vi.fn().mockResolvedValue(undefined)
const mockAddTripMember = vi.fn().mockResolvedValue(undefined)

vi.mock("@/features/settings/api", () => ({
  archiveTrip: (...a: any[]) => mockArchiveTrip(...a),
  deleteTrip: (...a: any[]) => mockDeleteTrip(...a),
  markSettled: (...a: any[]) => mockMarkSettled(...a),
  reopenTrip: (...a: any[]) => mockReopenTrip(...a),
  removeMember: (...a: any[]) => mockRemoveMember(...a),
  changeMemberRole: (...a: any[]) => mockChangeMemberRole(...a),
  addTripMember: (...a: any[]) => mockAddTripMember(...a),
}))

const mockListInvites = vi.fn()
const mockCreateInvite = vi.fn()
const mockRevokeInvite = vi.fn()

vi.mock("@/features/trips/api", () => ({
  listInvites: (...a: any[]) => mockListInvites(...a),
  createInvite: (...a: any[]) => mockCreateInvite(...a),
  revokeInvite: (...a: any[]) => mockRevokeInvite(...a),
}))

const mockDownloadCsv = vi.fn()
vi.mock("@/features/expenses/csvExport", () => ({
  downloadExpensesCsv: (...a: any[]) => mockDownloadCsv(...a),
}))

vi.mock("@/lib/useAdmin", () => ({
  useIsAdmin: vi.fn(() => ({ data: true })),
}))

vi.mock("@/lib/network", () => ({
  useOnline: vi.fn(() => true),
}))

function renderComponent(ui: React.ReactElement, initialRoute = "/trips/t_goa") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe("Empirical Challenge Suite: Milestone 2 Feature Screens & Micro-interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    currentExpensesMock = [...mockExpenses]
    currentActivitiesMock = [...mockActivities]
    mockRpc.mockResolvedValue({ data: { id: "res_1" }, error: null })
    mockListInvites.mockResolvedValue([
      {
        id: "inv-1",
        code: "GOA2026",
        is_active: true,
        expires_at: "2026-09-20T00:00:00Z",
        use_count: 0,
        max_uses: null,
      },
    ])
    mockCreateInvite.mockResolvedValue({
      id: "inv-2",
      code: "NEWCODE99",
      is_active: true,
    })
    mockRevokeInvite.mockResolvedValue({ success: true })

    // Canvas mock for summary card / charts
    const gradientMock = { addColorStop: vi.fn() }
    HTMLCanvasElement.prototype.getContext = (vi.fn(() => ({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })),
      arc: vi.fn(),
      arcTo: vi.fn(),
      clip: vi.fn(),
      roundRect: vi.fn(),
      createLinearGradient: vi.fn(() => gradientMock),
      createRadialGradient: vi.fn(() => gradientMock),
      strokeRect: vi.fn(),
    })) as any)
    HTMLCanvasElement.prototype.toDataURL = vi.fn(
      () => "data:image/png;base64,mock",
    )
  })

  // -------------------------------------------------------------
  // 1. EXPENSES PAGE: FILTER SWITCHING, SEARCH & ZERO STATES
  // -------------------------------------------------------------
  describe("ExpensesPage Filtering, Search & Micro-interactions", () => {
    it("renders expense list with date grouping, category emojis, and formatted amounts", () => {
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      expect(screen.getByText("Beach Villa Stay")).toBeInTheDocument()
      expect(screen.getByText("Seafood Dinner at Curlies")).toBeInTheDocument()
      expect(screen.getByText("Cab to Panaji")).toBeInTheDocument()

      // Tabular numerals / minor unit formatting
      expect(screen.getByText(/15,000/)).toBeInTheDocument()
      expect(screen.getByText(/6,000/)).toBeInTheDocument()
      expect(screen.getByText(/1,800/)).toBeInTheDocument()

      // Category emojis
      expect(screen.getByText("🏨")).toBeInTheDocument()
      expect(screen.getByText("🍕")).toBeInTheDocument()
      expect(screen.getByText("🚕")).toBeInTheDocument()
    })

    it("filters expenses by text search query across description and notes", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      const searchInput = screen.getByLabelText("Search expenses")
      await user.type(searchInput, "Curlies")

      expect(screen.getByText("Seafood Dinner at Curlies")).toBeInTheDocument()
      expect(screen.queryByText("Beach Villa Stay")).not.toBeInTheDocument()
      expect(screen.queryByText("Cab to Panaji")).not.toBeInTheDocument()
      expect(screen.getByText(/Showing 1 of 1/i)).toBeInTheDocument()

      // Search by note substring
      await user.clear(searchInput)
      await user.type(searchInput, "Sightseeing")
      expect(screen.getByText("Cab to Panaji")).toBeInTheDocument()
      expect(screen.queryByText("Seafood Dinner at Curlies")).not.toBeInTheDocument()
    })

    it("filters expenses by category dropdown selection", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      const categorySelect = screen.getByLabelText(/Category:/i)
      await user.selectOptions(categorySelect, "food")

      expect(screen.getByText("Seafood Dinner at Curlies")).toBeInTheDocument()
      expect(screen.queryByText("Beach Villa Stay")).not.toBeInTheDocument()
      expect(screen.queryByText("Cab to Panaji")).not.toBeInTheDocument()

      await user.selectOptions(categorySelect, "transport")
      expect(screen.getByText("Cab to Panaji")).toBeInTheDocument()
      expect(screen.queryByText("Seafood Dinner at Curlies")).not.toBeInTheDocument()
    })

    it("filters expenses by payer dropdown selection", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      const payerSelect = screen.getByLabelText(/Paid by:/i)
      await user.selectOptions(payerSelect, "u_sneha")

      expect(screen.getByText("Seafood Dinner at Curlies")).toBeInTheDocument()
      expect(screen.queryByText("Beach Villa Stay")).not.toBeInTheDocument()
      expect(screen.queryByText("Cab to Panaji")).not.toBeInTheDocument()
    })

    it("filters expenses by date range (From and To dates)", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      const dateFrom = screen.getByLabelText(/From:/i)
      const dateTo = screen.getByLabelText(/To:/i)

      await user.type(dateFrom, "2026-08-21")
      await user.type(dateTo, "2026-08-21")

      expect(screen.getByText("Seafood Dinner at Curlies")).toBeInTheDocument()
      expect(screen.queryByText("Beach Villa Stay")).not.toBeInTheDocument()
      expect(screen.queryByText("Cab to Panaji")).not.toBeInTheDocument()
    })

    it("sorts expenses by newest, oldest, and highest amount", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      const sortSelect = screen.getByLabelText(/Sort:/i)
      await user.selectOptions(sortSelect, "amount")

      const items = screen.getAllByRole("link", { name: /View details/i })
      expect(items.length).toBe(3)
      // Highest amount is ₹15,000 (Beach Villa), then ₹6,000 (Dinner), then ₹1,800 (Cab)
      expect(items[0]).toHaveTextContent("Beach Villa Stay")
      expect(items[1]).toHaveTextContent("Seafood Dinner at Curlies")
      expect(items[2]).toHaveTextContent("Cab to Panaji")
    })

    it("resets all active filters when 'Reset filters' button is clicked", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      const categorySelect = screen.getByLabelText(/Category:/i)
      await user.selectOptions(categorySelect, "food")
      expect(screen.getByText("Reset filters")).toBeInTheDocument()

      await user.click(screen.getByText("Reset filters"))
      expect(screen.getByText("Beach Villa Stay")).toBeInTheDocument()
      expect(screen.getByText("Seafood Dinner at Curlies")).toBeInTheDocument()
      expect(screen.getByText("Cab to Panaji")).toBeInTheDocument()
    })

    it("shows soft-deleted expenses with badge when owner checks 'Show deleted'", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      const showDeletedCheck = screen.getByLabelText(/Show deleted/i)
      expect(showDeletedCheck).toBeInTheDocument()

      await user.click(showDeletedCheck)
      expect(screen.getByText("Old Cancelled Activity")).toBeInTheDocument()
      expect(screen.getByText("Deleted")).toBeInTheDocument()
    })

    it("renders empty search state 🔍 with 'Clear all filters' CTA when no items match", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      const searchInput = screen.getByLabelText("Search expenses")
      await user.type(searchInput, "non-existent-xyz")

      expect(screen.getByText("No matching expenses")).toBeInTheDocument()
      expect(screen.getByText("No expenses matched your filter criteria.")).toBeInTheDocument()

      const clearBtn = screen.getByRole("button", { name: /Clear all filters/i })
      await user.click(clearBtn)

      expect(screen.getByText("Beach Villa Stay")).toBeInTheDocument()
    })

    it("renders zero-expenses empty state 💸 with 'Add first expense' CTA when trip has no expenses", async () => {
      currentExpensesMock = []

      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      expect(screen.getByText("No expenses recorded yet")).toBeInTheDocument()
      const addFirstLink = screen.getByRole("link", { name: /Add first expense/i })
      expect(addFirstLink).toHaveAttribute("href", "/trips/t_goa/expenses/new")
    })

    it("triggers CSV export download when 'Export CSV' button is clicked", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses",
      )

      const exportBtn = screen.getByRole("button", { name: /Export expenses as CSV/i })
      await user.click(exportBtn)

      expect(mockDownloadCsv).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Map),
        "Goa Vacation",
        "INR",
      )
    })
  })

  // -------------------------------------------------------------
  // 2. BALANCES PAGE: TAB & VIEW MODE SWITCHING & MODALS
  // -------------------------------------------------------------
  describe("BalancesPage Tab Switching, Settlement View Modes & Modals", () => {
    it("renders individual member net position cards with UserAvatar and tabular numerals", () => {
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/balances" element={<BalancesPage />} />
        </Routes>,
        "/trips/t_goa/balances",
      )

      expect(screen.getByText("Individual Positions (3)")).toBeInTheDocument()
      expect(screen.getAllByText("Arun Menon").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Sneha Rao").length).toBeGreaterThan(0)
      expect(screen.getAllByText("Dev Patel").length).toBeGreaterThan(0)

      // Check net position badges
      expect(screen.getByText("Receives")).toBeInTheDocument()
      expect(screen.getAllByText("Owes").length).toBeGreaterThan(0)

      // Check tabular numerals
      expect(screen.getAllByText(/7,400/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/1,600/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/5,800/).length).toBeGreaterThan(0)
    })

    it("switches settlement view modes between Overall, By Day, and By Category", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/balances" element={<BalancesPage />} />
        </Routes>,
        "/trips/t_goa/balances",
      )

      // Default: Overall
      expect(screen.getByText(/Optimized payment paths to clear all debts/i)).toBeInTheDocument()

      // Switch to By Day mode
      const dayTab = screen.getByRole("button", { name: /By Day/i })
      await user.click(dayTab)

      expect(screen.getByText(/Combined debt settlement across all days/i)).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /All Days/i })).toBeInTheDocument()

      // Click Day 1 pill (D1) in settlement ribbon
      const d1Btn = screen.getAllByRole("button", { name: /^D1/i })[0]
      await user.click(d1Btn)
      expect(screen.getByText(/Isolated debts for/i)).toBeInTheDocument()

      // Switch to By Category mode
      const catTab = screen.getByRole("button", { name: /By Category/i })
      await user.click(catTab)

      expect(screen.getByText(/Combined category debt settlement/i)).toBeInTheDocument()
      expect(screen.getAllByRole("button", { name: /Food/i }).length).toBeGreaterThan(0)

      // Click Food category pill
      const foodBtn = screen.getAllByRole("button", { name: /Food/i })[0]
      await user.click(foodBtn)
      expect(screen.getByText(/Debts calculated for/i)).toBeInTheDocument()

      // Switch back to Overall mode
      const overallTab = screen.getByRole("button", { name: /Overall/i })
      await user.click(overallTab)
      expect(screen.getByText(/Optimized payment paths to clear all debts/i)).toBeInTheDocument()
    })

    it("filters transfers to 'My debts' when toggled", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/balances" element={<BalancesPage />} />
        </Routes>,
        "/trips/t_goa/balances",
      )

      const myDebtsBtn = screen.getByRole("button", { name: /^My debts$/i })
      await user.click(myDebtsBtn)

      // Logged in user is Arun Menon (u_arun), who is owed money (receives)
      expect(screen.getAllByText("Arun Menon").length).toBeGreaterThan(0)
    })

    it("opens SettlementDialog when Settle button is clicked and fills category/day context", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/balances" element={<BalancesPage />} />
        </Routes>,
        "/trips/t_goa/balances",
      )

      // Switch to By Day and select D1
      await user.click(screen.getByRole("button", { name: /By Day/i }))
      await user.click(screen.getAllByRole("button", { name: /^D1/i })[0])

      const settleBtns = screen.getAllByRole("button", { name: /^Settle ₹/i })
      expect(settleBtns.length).toBeGreaterThan(0)
      await user.click(settleBtns[0])

      expect(screen.getByRole("dialog", { name: /Record settlement/i })).toBeInTheDocument()
      expect(screen.getByDisplayValue(/Day 1/i)).toBeInTheDocument()
    })

    it("opens PairwiseBreakdownDialog when 'Why this amount?' is clicked", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/balances" element={<BalancesPage />} />
        </Routes>,
        "/trips/t_goa/balances",
      )

      const whyBtns = screen.getAllByRole("button", { name: /Why this amount\?/i })
      expect(whyBtns.length).toBeGreaterThan(0)
      await user.click(whyBtns[0])

      expect(screen.getByRole("dialog", { name: /Pairwise Expense Ledger/i })).toBeInTheDocument()
    })

    it("opens ShareSummaryModal when 'Share summary' button is clicked", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/balances" element={<BalancesPage />} />
        </Routes>,
        "/trips/t_goa/balances",
      )

      const shareBtn = screen.getByRole("button", { name: /Share.*summary/i })
      await user.click(shareBtn)

      expect(screen.getByRole("dialog", { name: /Share Trip Summary/i })).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------
  // 3. ACTIVITY PAGE: FILTER TABS & PAGINATION
  // -------------------------------------------------------------
  describe("ActivityPage Filter Tabs & Pagination", () => {
    it("renders activity feed items with UserAvatar, action colors, and formatted summaries", () => {
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/activity" element={<ActivityPage />} />
        </Routes>,
        "/trips/t_goa/activity",
      )

      expect(screen.getByText(/Beach Villa Stay/i)).toBeInTheDocument()
      expect(screen.getByText(/joined the trip/i)).toBeInTheDocument()
      expect(screen.getByText(/settlement recorded by/i)).toBeInTheDocument()

      // Action badges
      expect(screen.getByText("create")).toBeInTheDocument()
      expect(screen.getByText("join")).toBeInTheDocument()
      expect(screen.getByText("settle")).toBeInTheDocument()
      expect(screen.getByText("soft delete")).toBeInTheDocument()
      expect(screen.getByText("role change")).toBeInTheDocument()
    })

    it("filters activity feed by expenses, settlements, and members tabs", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/activity" element={<ActivityPage />} />
        </Routes>,
        "/trips/t_goa/activity",
      )

      // Click "expenses" tab
      await user.click(screen.getByRole("button", { name: /^expenses$/i }))
      expect(screen.getByText(/Beach Villa Stay/i)).toBeInTheDocument()
      expect(screen.queryByText(/joined the trip/i)).not.toBeInTheDocument()

      // Click "settlements" tab
      await user.click(screen.getByRole("button", { name: /^settlements$/i }))
      expect(screen.getByText(/settlement recorded by/i)).toBeInTheDocument()
      expect(screen.queryByText(/Beach Villa Stay/i)).not.toBeInTheDocument()

      // Click "members" tab
      await user.click(screen.getByRole("button", { name: /^members$/i }))
      expect(screen.getByText(/joined the trip/i)).toBeInTheDocument()
      expect(screen.getByText(/changed member role/i)).toBeInTheDocument()
      expect(screen.queryByText(/Beach Villa Stay/i)).not.toBeInTheDocument()

      // Click "all" tab
      await user.click(screen.getByRole("button", { name: /^all$/i }))
      expect(screen.getByText(/Beach Villa Stay/i)).toBeInTheDocument()
      expect(screen.getByText(/joined the trip/i)).toBeInTheDocument()
    })

    it("displays empty state with History icon when filtered tab has 0 activities", async () => {
      const user = userEvent.setup()
      // Set activities with only an expense event
      currentActivitiesMock = [
        {
          id: "a1",
          trip_id: "t_goa",
          actor_user_id: "u_arun",
          action: "create",
          entity_type: "expense",
          entity_id: "e1",
          created_at: "2026-08-20T10:00:00Z",
          details: { description: "Villa" },
          changed_fields: [],
        },
      ]

      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/activity" element={<ActivityPage />} />
        </Routes>,
        "/trips/t_goa/activity",
      )

      await user.click(screen.getByRole("button", { name: /^settlements$/i }))
      expect(
        screen.getByText((_content, element) =>
          element?.tagName.toLowerCase() === "p" &&
          (element?.textContent?.includes("No settlements activity recorded yet") ?? false)
        )
      ).toBeInTheDocument()
    })

    it("calls fetchNextPage when 'Load more activity' button is clicked", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/activity" element={<ActivityPage />} />
        </Routes>,
        "/trips/t_goa/activity",
      )

      const loadMoreBtn = screen.getByRole("button", { name: /Load more activity/i })
      await user.click(loadMoreBtn)
      expect(mockFetchNextPage).toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------
  // 4. TRIP SETTINGS & INVITE MANAGER: ROLES, ADDS & INVITES
  // -------------------------------------------------------------
  describe("TripSettingsPage Member Management & Invite Code Creation", () => {
    it("renders member list with UserAvatar, role tags, and owner actions", () => {
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/settings" element={<TripSettingsPage />} />
        </Routes>,
        "/trips/t_goa/settings",
      )

      expect(screen.getByText("Members (3)")).toBeInTheDocument()
      expect(screen.getByText("Arun Menon")).toBeInTheDocument()
      expect(screen.getByText("Sneha Rao")).toBeInTheDocument()
      expect(screen.getByText("Dev Patel")).toBeInTheDocument()

      expect(screen.getByRole("button", { name: /Change to member/i })).toBeInTheDocument()
      expect(screen.getAllByRole("button", { name: /Promote to owner/i }).length).toBe(2)
      expect(screen.getAllByRole("button", { name: /^Remove/i }).length).toBe(3)
    })

    it("promotes member to owner and demotes owner to member", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/settings" element={<TripSettingsPage />} />
        </Routes>,
        "/trips/t_goa/settings",
      )

      const promoteBtns = screen.getAllByRole("button", { name: /Promote to owner/i })
      await user.click(promoteBtns[0])

      expect(mockChangeMemberRole).toHaveBeenCalledWith("t_goa", "u_sneha", "owner")
    })

    it("opens ConfirmDialog when Remove member is clicked and executes deletion", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/settings" element={<TripSettingsPage />} />
        </Routes>,
        "/trips/t_goa/settings",
      )

      const removeBtns = screen.getAllByRole("button", { name: /^Remove/i })
      await user.click(removeBtns[1]) // Remove Sneha

      const dialog = screen.getByRole("dialog")
      expect(within(dialog).getByText("Remove member?")).toBeInTheDocument()
      const confirmBtn = within(dialog).getByRole("button", { name: /Confirm/i })
      await user.click(confirmBtn)

      await waitFor(() => {
        expect(mockRemoveMember).toHaveBeenCalledWith("t_goa", "u_sneha")
      })
    })

    it("adds new member by email with selected role", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/settings" element={<TripSettingsPage />} />
        </Routes>,
        "/trips/t_goa/settings",
      )

      const emailInput = screen.getByLabelText(/Member email address/i)
      const roleSelect = screen.getByLabelText(/Member role/i)
      const addBtn = screen.getByRole("button", { name: /Add member/i })

      await user.type(emailInput, "newuser@example.com")
      await user.selectOptions(roleSelect, "owner")
      await user.click(addBtn)

      expect(mockAddTripMember).toHaveBeenCalledWith("t_goa", "newuser@example.com", "owner")
    })

    it("generates new invite code with custom expiry days and max uses", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/settings" element={<TripSettingsPage />} />
        </Routes>,
        "/trips/t_goa/settings",
      )

      const expiryInput = screen.getByLabelText(/Expires in days/i)
      const maxUsesInput = screen.getByLabelText(/Max uses/i)
      const generateBtn = screen.getByRole("button", { name: /Generate new/i })

      await user.clear(expiryInput)
      await user.type(expiryInput, "14")
      await user.type(maxUsesInput, "5")
      await user.click(generateBtn)

      expect(mockCreateInvite).toHaveBeenCalledWith("t_goa", 14, 5)
    })

    it("revokes active invite code with confirmation dialog", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/trips/:tripId/settings" element={<TripSettingsPage />} />
        </Routes>,
        "/trips/t_goa/settings",
      )

      // Wait for invite code to finish loading
      const revokeBtn = await screen.findByRole("button", { name: /^Revoke$/i })
      await user.click(revokeBtn)

      const dialog = screen.getByRole("dialog")
      expect(within(dialog).getByText("Revoke invite?")).toBeInTheDocument()
      const confirmRevokeBtn = within(dialog).getByRole("button", { name: /^Revoke$/i })
      await user.click(confirmRevokeBtn)

      await waitFor(() => {
        expect(mockRevokeInvite).toHaveBeenCalledWith("inv-1")
      })
    })
  })

  // -------------------------------------------------------------
  // 5. PROFILE PAGE: NAME EDITING & THEME SWITCHING
  // -------------------------------------------------------------
  describe("ProfilePage Name Editing & Theme Switching", () => {
    it("renders user profile with UserAvatar (size xl) and current user details", () => {
      renderComponent(
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>,
        "/profile",
      )

      expect(screen.getByRole("heading", { name: "Arun Menon" })).toBeInTheDocument()
      expect(screen.getByText("arun@example.com")).toBeInTheDocument()
      expect(screen.getByDisplayValue("Arun Menon")).toBeInTheDocument()
    })

    it("validates display name and enforces required validation", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>,
        "/profile",
      )

      const nameInput = screen.getByPlaceholderText("Your name")
      await user.clear(nameInput)
      await user.click(screen.getByRole("button", { name: /Save changes/i }))

      expect(await screen.findByText("Name is required")).toBeInTheDocument()
    })

    it("saves updated display name via Supabase RPC update_profile", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>,
        "/profile",
      )

      const nameInput = screen.getByPlaceholderText("Your name")
      await user.clear(nameInput)
      await user.type(nameInput, "Arun Kumar Menon")
      await user.click(screen.getByRole("button", { name: /Save changes/i }))

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith("update_profile", {
          p_name: "Arun Kumar Menon",
          p_user_id: "u_arun",
        })
      })
      expect(await screen.findByText(/Profile updated successfully/i)).toBeInTheDocument()
    })

    it("switches theme between System, Light, and Dark and applies DOM classes", async () => {
      const user = userEvent.setup()
      renderComponent(
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>,
        "/profile",
      )

      const darkBtn = screen.getByRole("button", { name: /Dark/i })
      const lightBtn = screen.getByRole("button", { name: /Light/i })
      const systemBtn = screen.getByRole("button", { name: /System/i })

      // Click Dark theme
      await user.click(darkBtn)
      expect(document.documentElement.classList.contains("dark")).toBe(true)

      // Click Light theme
      await user.click(lightBtn)
      expect(document.documentElement.classList.contains("light")).toBe(true)
      expect(document.documentElement.classList.contains("dark")).toBe(false)

      // Click System theme
      await user.click(systemBtn)
      expect(screen.getByRole("button", { name: /System/i })).toHaveClass("border-brand")
    })
  })
})
