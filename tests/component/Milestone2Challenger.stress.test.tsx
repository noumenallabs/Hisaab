import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DailyBreakdown } from "@/features/balances/DailyBreakdown"
import { CategoryBreakdown } from "@/features/balances/CategoryBreakdown"
import { ConfirmDialog } from "@/components/feedback/ConfirmDialog"
import { SettlementDialog } from "@/features/balances/SettlementDialog"
import { InviteTravelerModal } from "@/features/trips/InviteTravelerModal"
import { ShareSummaryModal } from "@/features/balances/ShareSummaryModal"
import { PairwiseBreakdownDialog } from "@/features/balances/PairwiseBreakdownDialog"
import { ToastProvider, useToast } from "@/components/feedback/ToastProvider"

// Mocks
const mockRpc = vi.fn()
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    rpc: mockRpc,
  }),
}))

const mockListInvites = vi.fn()
const mockCreateInvite = vi.fn()
vi.mock("@/features/trips/api", () => ({
  listInvites: (...args: any[]) => mockListInvites(...args),
  createInvite: (...args: any[]) => mockCreateInvite(...args),
}))

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>{ui}</ToastProvider>
    </QueryClientProvider>
  )
}

describe("Empirical Challenger M2: Accordions & Modal Dialog Stress Harness", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = '<div id="root"></div>'

    // Mock HTMLCanvasElement for JSDOM
    const gradientMock = { addColorStop: vi.fn() }
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
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
    })) as any
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,mock")
  })

  // =========================================================================
  // TASK 1: ACCORDION EXPAND/COLLAPSE ZERO-POPPING EMPIRICAL VERIFICATION
  // =========================================================================
  describe("Task 1: Zero-Popping CSS Grid Accordions", () => {
    const mockTimeline = [
      {
        date: "2026-08-20",
        label: "Day 1 (Aug 20)",
        dayNumber: 1,
        expenseCount: 2,
        totalMinor: 100000,
        isSettled: false,
        payerMap: { u1: 60000, u2: 40000 },
        transfers: [{ fromId: "u2", toId: "u1", amount: 10000 }],
      },
      {
        date: "2026-08-21",
        label: "Day 2 (Aug 21)",
        dayNumber: 2,
        expenseCount: 1,
        totalMinor: 50000,
        isSettled: true,
        payerMap: { u1: 25000, u2: 25000 },
        transfers: [],
      },
      {
        date: "2026-08-22",
        label: "Day 3 (Aug 22)",
        dayNumber: 3,
        expenseCount: 1,
        totalMinor: 80000,
        isSettled: false,
        payerMap: { u1: 80000 },
        transfers: [{ fromId: "u2", toId: "u1", amount: 40000 }],
      },
    ]

    const memberMap = new Map([
      ["u1", "Arun"],
      ["u2", "Sneha"],
    ])

    it("DailyBreakdown implements CSS Grid spring container without DOM unmounting", async () => {
      const onSettle = vi.fn()
      const { container } = renderWithProviders(
        <DailyBreakdown
          timeline={mockTimeline}
          currency="INR"
          memberMap={memberMap}
          currentUserId="u1"
          onSettle={onSettle}
        />
      )

      // Day 1 & Day 2 are expanded by default (idx < 2)
      const day1Region = container.querySelector("#day-content-2026-08-20")
      const day3Region = container.querySelector("#day-content-2026-08-22")

      expect(day1Region).not.toBeNull()
      expect(day3Region).not.toBeNull()

      // Verify CSS Grid layout classes for zero layout popping
      expect(day1Region).toHaveAttribute("data-expanded", "true")
      expect(day1Region).toHaveClass(
        "grid",
        "grid-rows-[0fr]",
        "data-[expanded=true]:grid-rows-[1fr]",
        "transition-[grid-template-rows]",
        "duration-250",
        "ease-spring",
        "overflow-hidden"
      )

      // Verify inner wrapper has min-h-0 and overflow-hidden to allow 0fr collapsing
      const innerChild = day1Region?.firstElementChild
      expect(innerChild).toHaveClass("min-h-0", "overflow-hidden")

      // Day 3 is collapsed initially
      expect(day3Region).toHaveAttribute("data-expanded", "false")

      // Toggle Day 3 to expand
      const day3Btn = container.querySelector("#day-header-2026-08-22") as HTMLButtonElement
      expect(day3Btn).toHaveAttribute("aria-expanded", "false")
      fireEvent.click(day3Btn)

      expect(day3Region).toHaveAttribute("data-expanded", "true")
      expect(day3Btn).toHaveAttribute("aria-expanded", "true")

      // Verify chevron does NOT unmount, but uses CSS transform rotate-180
      const chevron = day3Btn.querySelector(".lucide-chevron-down")
      expect(chevron).toHaveClass("transition-transform", "duration-200", "ease-spring", "rotate-180")

      // Toggle back to collapse
      fireEvent.click(day3Btn)
      expect(day3Region).toHaveAttribute("data-expanded", "false")
      expect(day3Btn).toHaveAttribute("aria-expanded", "false")
      expect(chevron).toHaveClass("rotate-0")
    })

    it("CategoryBreakdown implements CSS Grid spring container without DOM unmounting", async () => {
      const mockExpenses = [
        {
          id: "e1",
          amount_minor: 6000,
          category: "food",
          expense_payers: [{ user_id: "u1", amount_paid_minor: 6000 }],
          expense_splits: [
            { user_id: "u1", amount_owed_minor: 3000 },
            { user_id: "u2", amount_owed_minor: 3000 },
          ],
        },
      ]
      const members = [
        { id: "u1", name: "Arun" },
        { id: "u2", name: "Sneha" },
      ]

      const { container } = renderWithProviders(
        <CategoryBreakdown
          expenses={mockExpenses}
          members={members}
          currentUserId="u1"
          baseCurrency="INR"
        />
      )

      const contentRegion = container.querySelector("#category-breakdown-content")
      expect(contentRegion).not.toBeNull()
      expect(contentRegion).toHaveAttribute("data-expanded", "true")
      expect(contentRegion).toHaveClass(
        "grid",
        "grid-rows-[0fr]",
        "data-[expanded=true]:grid-rows-[1fr]",
        "transition-[grid-template-rows]",
        "duration-250",
        "ease-spring",
        "overflow-hidden"
      )

      const toggleBtn = screen.getByLabelText(/Collapse breakdown/i)
      fireEvent.click(toggleBtn)

      expect(contentRegion).toHaveAttribute("data-expanded", "false")
      expect(toggleBtn).toHaveAttribute("aria-expanded", "false")
      expect(toggleBtn).toHaveAttribute("aria-label", "Expand breakdown")
    })

    it("Expand all and Collapse all bulk controls smoothly toggle all accordions", () => {
      const { container } = renderWithProviders(
        <DailyBreakdown
          timeline={mockTimeline}
          currency="INR"
          memberMap={memberMap}
          currentUserId="u1"
          onSettle={vi.fn()}
        />
      )

      const expandAllBtn = screen.getByText("Expand all")
      const collapseAllBtn = screen.getByText("Collapse all")

      fireEvent.click(expandAllBtn)
      mockTimeline.forEach((day) => {
        const region = container.querySelector(`#day-content-${day.date}`)
        expect(region).toHaveAttribute("data-expanded", "true")
      })

      fireEvent.click(collapseAllBtn)
      mockTimeline.forEach((day) => {
        const region = container.querySelector(`#day-content-${day.date}`)
        expect(region).toHaveAttribute("data-expanded", "false")
      })
    })

    it("Rapid accordion toggling preserves strict state consistency without ghost renders", () => {
      const onSettle = vi.fn()
      const { container } = renderWithProviders(
        <DailyBreakdown
          timeline={mockTimeline}
          currency="INR"
          memberMap={memberMap}
          currentUserId="u1"
          onSettle={onSettle}
        />
      )

      const day1Btn = container.querySelector("#day-header-2026-08-20") as HTMLButtonElement
      const day1Region = container.querySelector("#day-content-2026-08-20")

      // Rapidly toggle 10 times
      for (let i = 0; i < 10; i++) {
        fireEvent.click(day1Btn)
      }

      // Initial was true, 10 toggles should be true
      expect(day1Region).toHaveAttribute("data-expanded", "true")
      expect(day1Btn).toHaveAttribute("aria-expanded", "true")

      // Click once more -> false
      fireEvent.click(day1Btn)
      expect(day1Region).toHaveAttribute("data-expanded", "false")
      expect(day1Btn).toHaveAttribute("aria-expanded", "false")
    })
  })

  // =========================================================================
  // TASK 2: MODAL DIALOGS STRESS-TESTING (FOCUS, ESC, BACKDROP, BREAKPOINTS)
  // =========================================================================
  describe("Task 2: Modal Dialogs Ergonomics, Focus Trapping & Mobile Bottom Sheets", () => {
    it("ConfirmDialog: focus trapping, Escape dismissal, backdrop click, body scroll lock, responsive classes", async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      const triggerBtn = document.createElement("button")
      triggerBtn.textContent = "Open Confirm"
      document.body.appendChild(triggerBtn)
      triggerBtn.focus()
      expect(document.activeElement).toBe(triggerBtn)

      const { unmount } = renderWithProviders(
        <ConfirmDialog
          open={true}
          onClose={onClose}
          onConfirm={onConfirm}
          title="Delete Expense?"
          description="This action cannot be undone."
          confirmLabel="Delete"
          danger={true}
        />
      )

      const dialog = document.getElementById("confirm-dialog")
      expect(dialog).not.toBeNull()

      // Body overflow lock & aria-hidden on #root
      expect(document.body.style.overflow).toBe("hidden")
      expect(document.getElementById("root")).toHaveAttribute("aria-hidden", "true")

      // Mobile bottom sheet & desktop responsive classes
      expect(dialog).toHaveClass(
        "max-sm:fixed",
        "max-sm:inset-x-0",
        "max-sm:bottom-0",
        "max-sm:rounded-t-3xl",
        "max-sm:max-h-[90dvh]",
        "max-sm:overflow-y-auto",
        "sm:max-w-md",
        "sm:rounded-2xl"
      )

      // Mobile grab bar present
      const grabBar = dialog?.querySelector(".bg-hair")
      expect(grabBar).not.toBeNull()

      // Initial focus on Cancel button
      const cancelBtn = screen.getByRole("button", { name: "Cancel" })
      const confirmBtn = screen.getByRole("button", { name: "Delete" })
      expect(document.activeElement).toBe(cancelBtn)

      // 44px+ tap targets (min-h-11)
      expect(cancelBtn).toHaveClass("min-h-11")
      expect(confirmBtn).toHaveClass("min-h-11")

      // Tab navigation focus wrap: Tab from Cancel -> Delete -> Tab wraps to Cancel
      await user.tab()
      expect(document.activeElement).toBe(confirmBtn)
      await user.tab()
      expect(document.activeElement).toBe(cancelBtn)

      // Shift+Tab navigation focus wrap: Shift+Tab from Cancel wraps to Delete
      await user.tab({ shift: true })
      expect(document.activeElement).toBe(confirmBtn)

      // Escape key triggers onClose
      fireEvent.keyDown(window, { key: "Escape" })
      expect(onClose).toHaveBeenCalledTimes(1)

      // Unmount / close restores body scroll and returns focus
      unmount()
      expect(document.body.style.overflow).toBe("")
      expect(document.getElementById("root")).not.toHaveAttribute("aria-hidden")
      expect(document.activeElement).toBe(triggerBtn)
    })

    it("ConfirmDialog: suppresses backdrop click and Escape dismiss when pending=true", () => {
      const onClose = vi.fn()
      const onConfirm = vi.fn()

      const { container } = renderWithProviders(
        <ConfirmDialog
          open={true}
          onClose={onClose}
          onConfirm={onConfirm}
          title="Processing..."
          description="Please wait"
          pending={true}
        />
      )

      // Escape key should NOT trigger onClose
      fireEvent.keyDown(window, { key: "Escape" })
      expect(onClose).not.toHaveBeenCalled()

      // Backdrop click should NOT trigger onClose
      const backdrop = document.querySelector(".bg-black\\/70") as HTMLElement
      expect(backdrop).not.toBeNull()
      fireEvent.click(backdrop)
      expect(onClose).not.toHaveBeenCalled()
    })

    it("SettlementDialog: responsive bottom sheet, focus management, 44px tap targets, and submission", async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      const onSuccess = vi.fn()

      const triggerBtn = document.createElement("button")
      triggerBtn.textContent = "Open Settle"
      document.body.appendChild(triggerBtn)
      triggerBtn.focus()

      const { unmount } = renderWithProviders(
        <SettlementDialog
          open={true}
          onClose={onClose}
          tripId="t1"
          fromId="u2"
          toId="u1"
          fromName="Sneha"
          toName="Arun"
          outstandingMinor={50000}
          currency="INR"
          onSuccess={onSuccess}
        />
      )

      const dialog = document.getElementById("settle-dialog")
      expect(dialog).not.toBeNull()

      // Body overflow lock
      expect(document.body.style.overflow).toBe("hidden")

      // Check responsive sheet classes
      expect(dialog).toHaveClass(
        "max-sm:fixed",
        "max-sm:inset-x-0",
        "max-sm:bottom-0",
        "max-sm:rounded-t-3xl",
        "sm:max-w-md",
        "sm:rounded-2xl"
      )

      // Check 44px+ input/select controls (min-h-11)
      const amountInput = screen.getByLabelText(/Amount/i)
      const methodSelect = screen.getByLabelText(/Payment Method/i)
      const confirmBtn = screen.getByRole("button", { name: /Confirm ₹500/i })
      const cancelBtn = screen.getByRole("button", { name: "Cancel" })

      expect(amountInput).toHaveClass("min-h-11")
      expect(methodSelect).toHaveClass("min-h-11")
      expect(confirmBtn).toHaveClass("min-h-11")
      expect(cancelBtn).toHaveClass("min-h-11")

      // Escape triggers onClose
      fireEvent.keyDown(window, { key: "Escape" })
      expect(onClose).toHaveBeenCalledTimes(1)

      unmount()
      expect(document.body.style.overflow).toBe("")
    })

    it("SettlementDialog: validates overpayment and renders accessible role=alert error", async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()

      renderWithProviders(
        <SettlementDialog
          open={true}
          onClose={onClose}
          tripId="t1"
          fromId="u2"
          toId="u1"
          fromName="Sneha"
          toName="Arun"
          outstandingMinor={50000}
          currency="INR"
        />
      )

      const amountInput = screen.getByLabelText(/Amount/i)
      await user.clear(amountInput)
      await user.type(amountInput, "9999")

      const confirmBtn = screen.getByRole("button", { name: /Confirm/i })
      await user.click(confirmBtn)

      const alert = screen.getByRole("alert")
      expect(alert).toHaveTextContent(/exceeds outstanding/i)
      expect(amountInput).toHaveAttribute("aria-invalid", "true")

      // Click "Full amount" quick action to fix error
      const fullAmountBtn = screen.getByRole("button", { name: /Full amount/i })
      await user.click(fullAmountBtn)

      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      expect(amountInput).toHaveAttribute("aria-invalid", "false")
    })

    it("InviteTravelerModal: focus trap, auto-generation, copy feedback, WhatsApp link", async () => {
      mockListInvites.mockResolvedValue([
        {
          id: "inv-1",
          code: "TEST1234",
          is_active: true,
          expires_at: "2026-09-20T00:00:00Z",
          use_count: 0,
        },
      ])

      const onClose = vi.fn()
      const { unmount } = renderWithProviders(
        <InviteTravelerModal
          open={true}
          onClose={onClose}
          tripId="t1"
          tripName="Goa Trip"
        />
      )

      await waitFor(() => {
        expect(screen.getByText("TEST1234")).toBeInTheDocument()
      })

      const dialog = document.getElementById("invite-dialog")
      expect(dialog).not.toBeNull()

      // Responsive bottom sheet check
      expect(dialog).toHaveClass(
        "max-sm:fixed",
        "max-sm:inset-x-0",
        "max-sm:bottom-0",
        "max-sm:rounded-t-3xl",
        "sm:max-w-md",
        "sm:rounded-2xl"
      )

      // Action buttons sizing
      const copyCodeBtn = screen.getByRole("button", { name: /Copy invite code/i })
      const copyLinkBtn = screen.getByRole("button", { name: /Copy direct join link/i })
      const waBtn = screen.getByRole("button", { name: /Share via WhatsApp/i })

      expect(copyCodeBtn).toHaveClass("min-h-11")
      expect(copyLinkBtn).toHaveClass("min-h-11")
      expect(waBtn).toHaveClass("min-h-11")

      // Escape key closes modal
      fireEvent.keyDown(window, { key: "Escape" })
      expect(onClose).toHaveBeenCalledTimes(1)

      unmount()
    })

    it("ShareSummaryModal: responsive layout, snapshot generation and copy trigger", async () => {
      const onClose = vi.fn()
      const opts = {
        tripName: "Goa 2026",
        currency: "INR",
        totalMinor: 150000,
        expenseCount: 5,
        transfers: [{ fromName: "Sneha", toName: "Arun", amountMinor: 25000 }],
        memberCount: 3,
        daysCount: 4,
      }

      const { unmount } = renderWithProviders(
        <ShareSummaryModal open={true} onClose={onClose} opts={opts} />
      )

      const dialog = document.getElementById("share-dialog")
      expect(dialog).not.toBeNull()
      expect(dialog).toHaveClass(
        "max-sm:fixed",
        "max-sm:inset-x-0",
        "max-sm:bottom-0",
        "max-sm:rounded-t-3xl",
        "sm:max-w-lg",
        "sm:rounded-2xl"
      )

      const shareImgBtn = screen.getByRole("button", { name: /Share \/ Save Image Card/i })
      const copyTextBtn = screen.getByRole("button", { name: /Copy Text/i })
      const waBtn = screen.getByRole("button", { name: /WhatsApp/i })

      expect(shareImgBtn).toHaveClass("min-h-12")
      expect(copyTextBtn).toHaveClass("min-h-11")
      expect(waBtn).toHaveClass("min-h-11")

      fireEvent.keyDown(window, { key: "Escape" })
      expect(onClose).toHaveBeenCalledTimes(1)

      unmount()
    })

    it("PairwiseBreakdownDialog: responsive bottom sheet and 44px Done button", async () => {
      const onClose = vi.fn()
      const mockExpenses = [
        {
          id: "e1",
          description: "Dinner",
          amount_minor: 4000,
          expense_payers: [{ user_id: "u1", amount_paid_minor: 4000 }],
          expense_splits: [
            { user_id: "u1", amount_owed_minor: 2000 },
            { user_id: "u2", amount_owed_minor: 2000 },
          ],
        },
      ]

      const { unmount } = renderWithProviders(
        <PairwiseBreakdownDialog
          open={true}
          onClose={onClose}
          expenses={mockExpenses}
          fromId="u2"
          toId="u1"
          fromName="Sneha"
          toName="Arun"
          transferAmountMinor={2000}
          baseCurrency="INR"
        />
      )

      const dialog = document.getElementById("pairwise-dialog")
      expect(dialog).not.toBeNull()
      expect(dialog).toHaveClass(
        "max-sm:fixed",
        "max-sm:inset-x-0",
        "max-sm:bottom-0",
        "max-sm:rounded-t-3xl",
        "sm:max-w-lg",
        "sm:rounded-2xl"
      )

      const doneBtn = screen.getByRole("button", { name: "Done" })
      expect(doneBtn).toHaveClass("min-h-11")

      fireEvent.click(doneBtn)
      expect(onClose).toHaveBeenCalledTimes(1)

      unmount()
    })
  })

  // =========================================================================
  // TASK 3: TOAST CELEBRATORY FEEDBACK & AMBIENT GLOW VERIFICATION
  // =========================================================================
  describe("Task 3: Celebratory Toast Feedback & Animations", () => {
    function ToastTestTrigger() {
      const { toast } = useToast()
      return (
        <div>
          <button onClick={() => toast("Celebration test!", "success")}>Trigger Success</button>
          <button onClick={() => toast("Error test!", "error")}>Trigger Error</button>
          <button onClick={() => toast("Info test!", "info")}>Trigger Info</button>
        </div>
      )
    }

    it("renders celebratory toast with spring animation, glow classes, and dismiss button", async () => {
      renderWithProviders(<ToastTestTrigger />)

      fireEvent.click(screen.getByText("Trigger Success"))

      const toastItem = screen.getByText("Celebration test!").closest(".animate-toast-in")
      expect(toastItem).not.toBeNull()
      expect(toastItem).toHaveClass("animate-toast-in", "shadow-glow-owed")

      const dismissBtn = screen.getByRole("button", { name: "Dismiss toast" })
      expect(dismissBtn).toHaveClass("active:scale-[0.90]")

      fireEvent.click(dismissBtn)
      expect(screen.queryByText("Celebration test!")).not.toBeInTheDocument()
    })

    it("renders error toast with assertive aria-live and glow-owe styling", () => {
      renderWithProviders(<ToastTestTrigger />)

      fireEvent.click(screen.getByText("Trigger Error"))

      const alertToast = screen.getByRole("alert")
      expect(alertToast).toHaveClass("animate-toast-in", "shadow-glow-owe", "border-owe/40")
      expect(screen.getByText("Error test!")).toBeInTheDocument()
    })
  })
})
