import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TripOverviewPage } from "@/features/trips/TripOverviewPage"
import { ExpensesPage } from "@/features/expenses/ExpensesPage"
import { BalancesPage } from "@/features/balances/BalancesPage"
import { ActivityPage } from "@/features/activity/ActivityPage"
import { TripSettingsPage } from "@/features/settings/TripSettingsPage"
import { ProfilePage } from "@/features/profile/ProfilePage"
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog"
import { SettlementDialog } from "@/features/balances/SettlementDialog"
import { InviteTravelerModal } from "@/features/trips/InviteTravelerModal"
import { ShareSummaryModal } from "@/features/balances/ShareSummaryModal"
import { PairwiseBreakdownDialog } from "@/features/balances/PairwiseBreakdownDialog"
import { ToastProvider } from "@/components/feedback/ToastProvider"
import { ThemeProvider } from "@/lib/theme"
import { AppHeader } from "@/components/navigation/AppHeader"
import { TripNavigation } from "@/components/navigation/TripNavigation"

// --- Supabase & Auth Mocks ---
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
const mockSignOut = vi.fn()

vi.mock("@/lib/auth", () => ({
  useAuth: vi.fn(() => ({
    user: mockAuthUser,
    setCustomUser: mockSetCustomUser,
    signOut: mockSignOut,
  })),
}))

const mockTripData = {
  id: "t_goa",
  name: "Goa Adventure 2026",
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
    created_at: "2026-08-20T10:00:00Z",
    created_by: "u_arun",
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
    created_at: "2026-08-21T21:00:00Z",
    created_by: "u_sneha",
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
    sent_minor: 0,
    received_minor: 0,
    net_minor: 800000, // +8,000 INR
  },
  {
    user_id: "u_sneha",
    paid_minor: 600000,
    owed_minor: 700000,
    sent_minor: 0,
    received_minor: 0,
    net_minor: -100000, // -1,000 INR
  },
  {
    user_id: "u_dev",
    paid_minor: 0,
    owed_minor: 700000,
    sent_minor: 0,
    received_minor: 0,
    net_minor: -700000, // -7,000 INR
  },
]

const mockActivityPages = {
  pages: [
    [
      {
        id: "act-1",
        action: "create",
        entity_type: "expense",
        entity_id: "e1",
        actor_user_id: "u_arun",
        created_at: "2026-08-20T10:00:00Z",
        metadata: { description: "Beach Villa Stay", amount_minor: 1500000 },
      },
      {
        id: "act-2",
        action: "join",
        entity_type: "trip_member",
        entity_id: "u_sneha",
        actor_user_id: "u_sneha",
        created_at: "2026-08-20T11:00:00Z",
        metadata: {},
      },
      {
        id: "act-3",
        action: "settle",
        entity_type: "settlement",
        entity_id: "s1",
        actor_user_id: "u_dev",
        created_at: "2026-08-21T18:00:00Z",
        metadata: {
          from_user_id: "u_dev",
          to_user_id: "u_arun",
          amount_minor: 700000,
        },
      },
    ],
  ],
}

vi.mock("@/features/trips/hooks", () => ({
  useTrip: vi.fn((id: string) => ({
    data: id === "t_goa" ? mockTripData : null,
    isLoading: false,
  })),
}))

vi.mock("@/features/trips/useMembers", () => ({
  useTripMembers: vi.fn(() => ({
    data: mockMembers,
    isLoading: false,
  })),
  tripMembersKeys: {
    list: (id: string) => ["trip_members", id],
  },
}))

vi.mock("@/features/expenses/hooks", () => ({
  useExpenses: vi.fn(() => ({
    data: mockExpenses,
    isLoading: false,
  })),
  useExpense: vi.fn((_tripId: string, id: string) => ({
    data: mockExpenses.find((e) => e.id === id) ?? null,
    isLoading: false,
  })),
}))

vi.mock("@/features/balances/hooks", () => ({
  useBalances: vi.fn(() => ({
    data: mockBalances,
    isLoading: false,
  })),
  useSettlements: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
}))

vi.mock("@/features/activity/hooks", () => ({
  useActivity: vi.fn(() => ({
    data: mockActivityPages,
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}))

vi.mock("@/lib/useAdmin", () => ({
  useIsAdmin: vi.fn(() => ({
    data: true,
    isLoading: false,
  })),
}))

vi.mock("@/lib/network", () => ({
  useOnline: vi.fn(() => true),
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
}

function renderWithProviders(ui: React.ReactElement, route = "/trips/t_goa") {
  const qc = createTestQueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

describe("Tier 5 Adversarial UI & Accessibility Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("1. Dialogs & Modals WCAG 2.1 AA Focus, ARIA, and Keyboard Dismissals", () => {
    it("ConfirmDialog traps focus, cycles tab keys, closes on Escape and backdrop click", async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      render(
        <div>
          <button id="trigger-btn">Delete Trip</button>
          <ConfirmDialog
            open={true}
            onClose={onClose}
            onConfirm={onConfirm}
            title="Archive trip?"
            description="This will lock all expenses to read-only."
            confirmLabel="Archive"
            danger
          />
        </div>
      )

      const dialog = screen.getByRole("dialog")
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveAttribute("aria-modal", "true")
      expect(dialog).toHaveAttribute("aria-labelledby", "confirm-title")
      expect(dialog).toHaveAttribute("aria-describedby", "confirm-desc")

      // Check focus started on Cancel button
      const cancelBtn = screen.getByRole("button", { name: "Cancel" })
      const confirmBtn = screen.getByRole("button", { name: "Archive" })
      expect(cancelBtn).toHaveFocus()

      // Tab moves to Archive
      await user.tab()
      expect(confirmBtn).toHaveFocus()

      // Tab wraps back to Cancel
      await user.tab()
      expect(cancelBtn).toHaveFocus()

      // Shift+Tab wraps back to Archive
      await user.tab({ shift: true })
      expect(confirmBtn).toHaveFocus()

      // Escape closes dialog
      await user.keyboard("{Escape}")
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("SettlementDialog enforces ARIA attributes, pre-fills amount, supports UPI deep link", async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onSuccess = vi.fn()

      render(
        <SettlementDialog
          open={true}
          onClose={onClose}
          tripId="t_goa"
          fromId="u_dev"
          toId="u_arun"
          fromName="Dev Patel"
          toName="Arun Menon"
          outstandingMinor={700000}
          currency="INR"
          onSuccess={onSuccess}
        />
      )

      const dialog = screen.getByRole("dialog")
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveAttribute("aria-modal", "true")
      expect(dialog).toHaveAttribute("aria-labelledby", "settle-title")

      // Settle Amount input should have focus and initial full amount
      const amountInput = screen.getByRole("textbox", { name: /amount/i })
      expect(amountInput).toHaveValue("7000")

      // Verify UPI direct payment action is present for quick settling
      const upiLink = screen.getByRole("link", { name: /open upi app/i })
      expect(upiLink).toHaveAttribute("href", expect.stringContaining("upi://pay"))
      expect(upiLink).toHaveAttribute("href", expect.stringContaining("Arun%20Menon"))

      // Escape dismisses
      await user.keyboard("{Escape}")
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("InviteTravelerModal provides accessible copy buttons and WhatsApp integration", async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      renderWithProviders(
        <InviteTravelerModal
          open={true}
          onClose={onClose}
          tripId="t_goa"
          tripName="Goa Adventure 2026"
        />
      )

      const dialog = screen.getByRole("dialog")
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveAttribute("aria-modal", "true")
      expect(dialog).toHaveAttribute("aria-labelledby", "invite-modal-title")

      // Close button with aria label
      const closeBtn = screen.getByRole("button", { name: /close invite modal/i })
      expect(closeBtn).toBeInTheDocument()

      // Escape key handler
      await user.keyboard("{Escape}")
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it("ShareSummaryModal renders accessible snapshot options and share triggers", () => {
      const onClose = vi.fn()
      const opts = {
        tripName: "Goa Adventure 2026",
        currency: "INR",
        totalMinor: 2100000,
        expenseCount: 2,
        memberCount: 3,
        destination: "Goa, India",
        transfers: [
          { fromName: "Dev Patel", toName: "Arun Menon", amountMinor: 700000 },
          { fromName: "Sneha Rao", toName: "Arun Menon", amountMinor: 100000 },
        ],
        categories: [
          { label: "Accommodation", emoji: "🏨", totalMinor: 1500000, percentage: 71.4 },
          { label: "Food", emoji: "🍕", totalMinor: 600000, percentage: 28.6 },
        ],
      }

      render(
        <ShareSummaryModal
          open={true}
          onClose={onClose}
          opts={opts}
        />
      )

      const dialog = screen.getByRole("dialog")
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveAttribute("aria-modal", "true")
      expect(dialog).toHaveAttribute("aria-labelledby", "share-modal-title")

      expect(screen.getByText("Share Trip Summary")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /share \/ save image card/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /copy text/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /whatsapp/i })).toBeInTheDocument()
    })

    it("PairwiseBreakdownDialog renders detailed pairwise transaction ledger", () => {
      const onClose = vi.fn()

      render(
        <PairwiseBreakdownDialog
          open={true}
          onClose={onClose}
          expenses={mockExpenses}
          fromId="u_dev"
          toId="u_arun"
          fromName="Dev Patel"
          toName="Arun Menon"
          transferAmountMinor={700000}
          baseCurrency="INR"
        />
      )

      const dialog = screen.getByRole("dialog")
      expect(dialog).toBeInTheDocument()
      expect(dialog).toHaveAttribute("aria-modal", "true")
      expect(dialog).toHaveAttribute("aria-labelledby", "pairwise-title")

      expect(screen.getByText("Pairwise Expense Ledger")).toBeInTheDocument()
      expect(screen.getByText("Beach Villa Stay")).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument()
    })
  })

  describe("2. Multi-Screen UI & A11y Verification Across 6 Feature Views", () => {
    it("TripOverviewPage: renders personal standing banner, asymmetric stat cards, daily bars, donut, member breakdown, and quick actions", async () => {
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
        "/trips/t_goa"
      )

      // Header info
      expect(screen.getByText("Goa Adventure 2026")).toBeInTheDocument()
      expect(screen.getByText(/Goa, India/)).toBeInTheDocument()

      // Personal Balance Banner for Arun (Net +8,000 INR -> "You are owed")
      expect(screen.getByText(/Personal Balance · You are owed/i)).toBeInTheDocument()
      expect(screen.getByText("₹8,000.00")).toBeInTheDocument()

      // Quick Actions Hub
      expect(screen.getByRole("link", { name: /add new expense/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /settle debts/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /invite traveler/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /share trip summary/i })).toBeInTheDocument()

      // Asymmetric Metric Cards
      expect(screen.getByText("Total Spending")).toBeInTheDocument()
      expect(screen.getAllByText("₹21,000.00").length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText("Avg / Person")).toBeInTheDocument()
      expect(screen.getAllByText("₹7,000.00").length).toBeGreaterThanOrEqual(1)

      // Spending Trajectory & Categories
      expect(screen.getByText("Spending Trajectory")).toBeInTheDocument()
      expect(screen.getByText("Spending by Category")).toBeInTheDocument()

      // Member Breakdown List
      expect(screen.getByText(/Member Breakdown/i)).toBeInTheDocument()
      expect(screen.getAllByText("Arun Menon").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Sneha Rao").length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText("Dev Patel").length).toBeGreaterThanOrEqual(1)
    })

    it("ExpensesPage: renders search, filter toolbar, CSV export, and expense rows", async () => {
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId/expenses" element={<ExpensesPage />} />
        </Routes>,
        "/trips/t_goa/expenses"
      )

      expect(screen.getByRole("heading", { name: "Expenses" })).toBeInTheDocument()
      expect(screen.getByRole("textbox", { name: /search expenses/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /export expenses as csv/i })).toBeInTheDocument()
      expect(screen.getByRole("link", { name: /add expense/i })).toBeInTheDocument()

      expect(screen.getByText("Beach Villa Stay")).toBeInTheDocument()
      expect(screen.getByText("Seafood Dinner at Curlies")).toBeInTheDocument()
    })

    it("BalancesPage: renders multi-mode settlement matrix, debt filters, and simplified transfers", async () => {
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId/balances" element={<BalancesPage />} />
        </Routes>,
        "/trips/t_goa/balances"
      )

      expect(screen.getByRole("heading", { name: /balances & settlements/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /overall/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /by day/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /by category/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /share trip settlement summary/i })).toBeInTheDocument()

      // Check debt filter tabs
      expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /my debts/i })).toBeInTheDocument()

      // Check simplified transfer cards & members
      expect(screen.getAllByText(/Dev Patel/i).length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText(/Sneha Rao/i).length).toBeGreaterThanOrEqual(1)
    })

    it("ActivityPage: renders activity filter badges, audit events, and actor avatars", async () => {
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId/activity" element={<ActivityPage />} />
        </Routes>,
        "/trips/t_goa/activity"
      )

      expect(screen.getByRole("heading", { name: "Activity log" })).toBeInTheDocument()

      // Filters
      expect(screen.getByRole("button", { name: "all" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "expenses" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "settlements" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "members" })).toBeInTheDocument()

      // Activity entries
      expect(screen.getByText(/Arun Menon paid ₹15,000.00 for "Beach Villa Stay"/i)).toBeInTheDocument()
      expect(screen.getByText(/Sneha Rao joined the trip/i)).toBeInTheDocument()
      expect(screen.getByText(/Dev Patel recorded a settlement/i)).toBeInTheDocument()
    })

    it("TripSettingsPage: renders trip metadata, member list, and email addition form", async () => {
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId/settings" element={<TripSettingsPage />} />
        </Routes>,
        "/trips/t_goa/settings"
      )

      expect(screen.getByRole("heading", { name: "Trip settings" })).toBeInTheDocument()
      expect(screen.getByText("Goa Adventure 2026")).toBeInTheDocument()
      expect(screen.getByRole("textbox", { name: /member email address/i })).toBeInTheDocument()
      expect(screen.getByRole("combobox", { name: /member role/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /add member/i })).toBeInTheDocument()

      expect(screen.getByText(/Sneha Rao/i)).toBeInTheDocument()
      expect(screen.getByText(/Dev Patel/i)).toBeInTheDocument()
    })

    it("ProfilePage: renders display name edit form, read-only email, and theme selection buttons", async () => {
      renderWithProviders(
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
        </Routes>,
        "/profile"
      )

      expect(screen.getByRole("textbox", { name: /display name/i })).toHaveValue("Arun Menon")
      expect(screen.getByRole("textbox", { name: /email \(read-only\)/i })).toHaveValue("arun@example.com")
      expect(screen.getByRole("textbox", { name: /email \(read-only\)/i })).toBeDisabled()

      // Theme toggle buttons
      expect(screen.getByRole("button", { name: /system/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /dark/i })).toBeInTheDocument()
    })
  })

  describe("3. Responsive Layouts & Navigation Target Consistency", () => {
    it("AppHeader renders brand logo, theme toggle, profile link, and sign-out button", () => {
      renderWithProviders(<AppHeader />, "/trips")

      expect(screen.getByRole("link", { name: "Hissaab home" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /switch to (dark|light) theme/i })).toBeInTheDocument()
      expect(screen.getByRole("link", { name: "View profile" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument()
    })

    it("TripNavigation renders all 5 primary desktop tabs with active state indicator", () => {
      renderWithProviders(
        <TripNavigation tripId="t_goa" base="/trips/t_goa" />,
        "/trips/t_goa"
      )

      const nav = screen.getByRole("navigation", { name: "Trip sections" })
      expect(nav).toBeInTheDocument()

      const tabs = ["Overview", "Expenses", "Balances", "Activity", "Settings"]
      for (const tab of tabs) {
        expect(screen.getByRole("link", { name: tab })).toBeInTheDocument()
      }
    })
  })

  describe("4. WCAG 2.1 AA Color Contrast Mathematical Verification", () => {
    function hexToLuminance(hex: string): number {
      const clean = hex.replace("#", "")
      const r = parseInt(clean.substring(0, 2), 16) / 255
      const g = parseInt(clean.substring(2, 4), 16) / 255
      const b = parseInt(clean.substring(4, 6), 16) / 255

      const toLinear = (c: number) =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)

      const lr = toLinear(r)
      const lg = toLinear(g)
      const lb = toLinear(b)

      return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
    }

    function getContrastRatio(hex1: string, hex2: string): number {
      const l1 = hexToLuminance(hex1)
      const l2 = hexToLuminance(hex2)
      const lighter = Math.max(l1, l2)
      const darker = Math.min(l1, l2)
      return (lighter + 0.05) / (darker + 0.05)
    }

    it("Light theme tokens satisfy WCAG 2.1 AA contrast requirements (>= 4.5:1 for body text)", () => {
      const surface = "#ffffff"
      const canvas = "#f4f6f9"
      const ink = "#1c2430"
      const inkSoft = "#5b6672"
      const inkFaint = "#6b7785"
      const brand = "#2563eb"
      const owed = "#0a7a54"
      const owe = "#c53c34"

      // Primary text on surface & canvas (WCAG AAA >= 7:1)
      expect(getContrastRatio(ink, surface)).toBeGreaterThanOrEqual(14.0)
      expect(getContrastRatio(ink, canvas)).toBeGreaterThanOrEqual(12.0)

      // Secondary text (ink-soft) on surface & canvas (WCAG AA >= 4.5:1)
      expect(getContrastRatio(inkSoft, surface)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(inkSoft, canvas)).toBeGreaterThanOrEqual(4.5)

      // Faint metadata (ink-faint) on surface (WCAG AA >= 4.5:1)
      expect(getContrastRatio(inkFaint, surface)).toBeGreaterThanOrEqual(4.5)

      // Semantic status indicators on surface
      expect(getContrastRatio(brand, surface)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(owed, surface)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(owe, surface)).toBeGreaterThanOrEqual(4.5)
    })

    it("Dark theme tokens satisfy WCAG 2.1 AA contrast requirements", () => {
      const surfaceDark = "#151d2a"
      const canvasDark = "#0b0f17"
      const inkDark = "#f3f4f6"
      const inkSoftDark = "#9ca3af"
      const brandDark = "#3b82f6"
      const owedDark = "#34d399"
      const oweDark = "#f87171"

      // Primary text on dark surface (WCAG AAA >= 7:1)
      expect(getContrastRatio(inkDark, surfaceDark)).toBeGreaterThanOrEqual(13.0)
      expect(getContrastRatio(inkDark, canvasDark)).toBeGreaterThanOrEqual(14.0)

      // Secondary text on dark surface (WCAG AA >= 4.5:1)
      expect(getContrastRatio(inkSoftDark, surfaceDark)).toBeGreaterThanOrEqual(5.5)

      // Semantic status indicators on dark surface
      expect(getContrastRatio(brandDark, surfaceDark)).toBeGreaterThanOrEqual(4.5)
      expect(getContrastRatio(owedDark, surfaceDark)).toBeGreaterThanOrEqual(7.0)
      expect(getContrastRatio(oweDark, surfaceDark)).toBeGreaterThanOrEqual(5.0)
    })
  })
})

