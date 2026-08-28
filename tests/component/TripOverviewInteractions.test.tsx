import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TripOverviewPage } from "@/features/trips/TripOverviewPage"
import { ToastProvider } from "@/components/feedback/ToastProvider"

const mockRpc = vi.fn()
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: mockRpc,
    auth: { getSession: vi.fn() },
  }),
}))

const mockAuthUser = {
  id: "u_arun",
  name: "Arun Menon",
  email: "arun@example.com",
}
vi.mock("@/lib/auth", () => ({
  useAuth: vi.fn(() => ({ user: mockAuthUser })),
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

const mockListInvites = vi.fn()
const mockCreateInvite = vi.fn()
vi.mock("@/features/trips/api", () => ({
  listInvites: (...args: any[]) => mockListInvites(...args),
  createInvite: (...args: any[]) => mockCreateInvite(...args),
}))

function renderWithProviders(
  ui: React.ReactElement,
  initialRoute = "/trips/t_goa",
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

describe("Empirical Challenge: Trip Overview Hub Navigation & Modals", () => {
  let consoleErrorSpy: any
  let consoleWarnSpy: any
  let mockExecCommand: any
  let writeTextSpy: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: { id: "s1" }, error: null })
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
      code: "NEW123",
      is_active: true,
    })

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    // Mock HTMLCanvasElement methods for JSDOM
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

    mockExecCommand = vi.fn().mockReturnValue(true)
    document.execCommand = mockExecCommand

    if (navigator.clipboard?.writeText) {
      writeTextSpy = vi
        .spyOn(navigator.clipboard, "writeText")
        .mockResolvedValue(undefined)
    } else {
      writeTextSpy = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: writeTextSpy },
        configurable: true,
        writable: true,
      })
    }

    window.open = vi.fn()
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  describe("1. Navigation Routes and Links Verification", () => {
    it("verifies all navigation links have correct targets and attributes", () => {
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      // Add Expense quick action link
      const addExpenseLink = screen.getByRole("link", {
        name: /Add new expense/i,
      })
      expect(addExpenseLink).toHaveAttribute(
        "href",
        "/trips/t_goa/expenses/new",
      )

      // Balances matrix link in hero banner
      const balancesLink = screen.getByRole("link", {
        name: /Balances matrix/i,
      })
      expect(balancesLink).toHaveAttribute("href", "/trips/t_goa/balances")

      // Detailed breakdown link in Category section
      const categoryBreakdownLink = screen.getByRole("link", {
        name: /Detailed breakdown/i,
      })
      expect(categoryBreakdownLink).toHaveAttribute(
        "href",
        "/trips/t_goa/balances",
      )

      // View all expenses link
      const viewAllExpensesLink = screen.getByRole("link", {
        name: /View all \(2\)/i,
      })
      expect(viewAllExpensesLink).toHaveAttribute(
        "href",
        "/trips/t_goa/expenses",
      )

      // Individual expense row links
      const expense1Link = screen.getByRole("link", {
        name: /Beach Villa Stay/i,
      })
      expect(expense1Link).toHaveAttribute("href", "/trips/t_goa/expenses/e1")

      const expense2Link = screen.getByRole("link", { name: /Seafood Shack/i })
      expect(expense2Link).toHaveAttribute("href", "/trips/t_goa/expenses/e2")

      // Member manage link
      const manageMembersLink = screen.getByRole("link", { name: /Manage/i })
      expect(manageMembersLink).toHaveAttribute("href", "/trips/t_goa/settings")

      // Quick settlements 'All' link
      const allSettlementsLink = screen.getByRole("link", { name: /^All$/i })
      expect(allSettlementsLink).toHaveAttribute(
        "href",
        "/trips/t_goa/balances",
      )
    })

    it("verifies empty state navigation links when 0 expenses exist", async () => {
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

      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      // Add first expense link
      const addFirstLink = screen.getByRole("link", {
        name: /Add first expense/i,
      })
      expect(addFirstLink).toHaveAttribute("href", "/trips/t_goa/expenses/new")

      // Explore Balances link
      const exploreBalancesLink = screen.getByRole("link", {
        name: /Explore Balances/i,
      })
      expect(exploreBalancesLink).toHaveAttribute(
        "href",
        "/trips/t_goa/balances",
      )
    })
  })

  describe("2. Invite Traveler Modal Interactive Triggers", () => {
    it("copies invite code to clipboard when 'Copy Code' is clicked", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      // Open Invite modal
      const inviteBtn = screen.getByRole("button", { name: /Invite traveler/i })
      await user.click(inviteBtn)

      const dialog = await screen.findByRole("dialog", {
        name: /Invite Travelers/i,
      })
      expect(dialog).toBeInTheDocument()
      expect(screen.getByText("GOA2026")).toBeInTheDocument()

      // Click copy code
      const copyCodeBtn = screen.getByRole("button", {
        name: /Copy invite code GOA2026/i,
      })
      await user.click(copyCodeBtn)

      expect(mockExecCommand).toHaveBeenCalledWith("copy")
      expect(await screen.findByText(/Copied Code/i)).toBeInTheDocument()
    })

    it("copies direct join link to clipboard when 'Copy Join Link' is clicked", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const inviteBtn = screen.getByRole("button", { name: /Invite traveler/i })
      await user.click(inviteBtn)

      const copyLinkBtn = await screen.findByRole("button", {
        name: /Copy direct join link/i,
      })
      await user.click(copyLinkBtn)

      expect(mockExecCommand).toHaveBeenCalledWith("copy")
      expect(await screen.findByText(/Copied Link/i)).toBeInTheDocument()
    })

    it("opens WhatsApp share window with pre-filled message", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const inviteBtn = screen.getByRole("button", { name: /Invite traveler/i })
      await user.click(inviteBtn)

      const whatsappBtn = await screen.findByRole("button", {
        name: /Share via WhatsApp/i,
      })
      await user.click(whatsappBtn)

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("https://wa.me/?text="),
        "_blank",
        "noopener,noreferrer",
      )
    })

    it("closes invite modal when Close button, X button, or Escape key is pressed", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const inviteBtn = screen.getByRole("button", { name: /Invite traveler/i })
      await user.click(inviteBtn)

      const closeBtn = await screen.findByRole("button", {
        name: /Close invite modal/i,
      })
      await user.click(closeBtn)

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: /Invite Travelers/i }),
        ).not.toBeInTheDocument()
      })
    })

    it("auto-generates invite code when no active code exists", async () => {
      mockListInvites.mockResolvedValueOnce([])
      const user = userEvent.setup()

      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const inviteBtn = screen.getByRole("button", { name: /Invite traveler/i })
      await user.click(inviteBtn)

      await waitFor(() => {
        expect(mockCreateInvite).toHaveBeenCalledWith("t_goa", 30, null)
      })
    })
  })

  describe("3. Share Trip Summary Modal Interactive Triggers", () => {
    it("opens share modal, generates text breakdown, and copies to clipboard", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const shareBtn = screen.getByRole("button", {
        name: /Share trip summary/i,
      })
      await user.click(shareBtn)

      const dialog = await screen.findByRole("dialog", {
        name: /Share Trip Summary/i,
      })
      expect(dialog).toBeInTheDocument()

      // Copy text button
      const copyTextBtn = screen.getByRole("button", { name: /Copy Text/i })
      await user.click(copyTextBtn)

      expect(writeTextSpy).toHaveBeenCalledWith(
        expect.stringContaining("Goa Vacation"),
      )
      expect(await screen.findByText(/Copied!/i)).toBeInTheDocument()
    })

    it("triggers WhatsApp sharing for trip summary text", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const shareBtn = screen.getByRole("button", {
        name: /Share trip summary/i,
      })
      await user.click(shareBtn)

      const whatsappBtn = await screen.findByRole("button", {
        name: /WhatsApp/i,
      })
      await user.click(whatsappBtn)

      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining("https://wa.me/?text="),
        "_blank",
        "noopener,noreferrer",
      )
    })

    it("closes share modal when X button is clicked", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const shareBtn = screen.getByRole("button", {
        name: /Share trip summary/i,
      })
      await user.click(shareBtn)

      const closeBtn = await screen.findByRole("button", {
        name: /Close dialog/i,
      })
      await user.click(closeBtn)

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: /Share Trip Summary/i }),
        ).not.toBeInTheDocument()
      })
    })
  })

  describe("4. Settle Up Dialog Triggers and Interactions", () => {
    it("opens settlement dialog from top quick actions", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const settleBtn = screen.getByRole("button", { name: /Settle debts/i })
      await user.click(settleBtn)

      const dialog = await screen.findByRole("dialog", {
        name: /Record settlement/i,
      })
      expect(dialog).toBeInTheDocument()
      expect(screen.getByLabelText(/Amount \(INR\)/i)).toBeInTheDocument()
    })

    it("opens settlement dialog from individual settlement row and fills transfer details", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const rowSettleBtns = screen.getAllByRole("button", { name: /^Settle$/i })
      expect(rowSettleBtns.length).toBeGreaterThan(0)
      await user.click(rowSettleBtns[0])

      const dialog = await screen.findByRole("dialog", {
        name: /Record settlement/i,
      })
      expect(dialog).toBeInTheDocument()
    })

    it("allows owing user to click 'Settle your share' from personal standing hero banner", async () => {
      const { useAuth } = await import("@/lib/auth")
      // User u_sneha owes money in mockBalances (net_minor: -100000)
      vi.mocked(useAuth).mockReturnValue({
        user: {
          id: "u_sneha",
          name: "Sneha Rao",
          email: "sneha@example.com",
        } as any,
      } as any)

      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      expect(
        screen.getByText(/Personal Balance · You owe/i),
      ).toBeInTheDocument()
      const settleShareBtn = screen.getByRole("button", {
        name: /Settle your share/i,
      })
      await user.click(settleShareBtn)

      const dialog = await screen.findByRole("dialog", {
        name: /Record settlement/i,
      })
      expect(dialog).toBeInTheDocument()
    })

    it("records settlement and triggers Supabase RPC when confirmed", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const settleBtn = screen.getByRole("button", { name: /Settle debts/i })
      await user.click(settleBtn)

      const confirmBtn = await screen.findByRole("button", { name: /Confirm/i })
      await user.click(confirmBtn)

      await waitFor(() => {
        expect(mockRpc).toHaveBeenCalledWith(
          "record_settlement",
          expect.objectContaining({
            p_payload: expect.objectContaining({
              tripId: "t_goa",
              paymentMethod: "UPI",
            }),
          }),
        )
      })
    })

    it("validates and rejects overpayment amount in settlement dialog", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      const settleBtn = screen.getByRole("button", { name: /Settle debts/i })
      await user.click(settleBtn)

      const amountInput = screen.getByLabelText(/Amount \(INR\)/i)
      await user.clear(amountInput)
      await user.type(amountInput, "999999")

      const confirmBtn = screen.getByRole("button", { name: /Confirm/i })
      await user.click(confirmBtn)

      expect(
        await screen.findByText(/exceeds outstanding/i),
      ).toBeInTheDocument()
      expect(mockRpc).not.toHaveBeenCalled()
    })
  })

  describe("5. Zero Console Errors / Integrity Audit", () => {
    it("executes full dashboard flow with 0 unhandled console errors or warnings", async () => {
      const user = userEvent.setup()
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>,
      )

      // Open and close Invite Modal
      await user.click(screen.getByRole("button", { name: /Invite traveler/i }))
      await user.click(
        screen.getByRole("button", { name: /Close invite modal/i }),
      )

      // Open and close Share Modal
      await user.click(
        screen.getByRole("button", { name: /Share trip summary/i }),
      )
      await user.click(screen.getByRole("button", { name: /Close dialog/i }))

      // Open and close Settlement Dialog
      await user.click(screen.getByRole("button", { name: /Settle debts/i }))
      await user.click(screen.getByRole("button", { name: /Cancel/i }))

      expect(consoleErrorSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
    })
  })
})
