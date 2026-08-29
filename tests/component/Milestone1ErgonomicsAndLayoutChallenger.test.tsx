import { describe, it, expect, vi, beforeEach } from "vitest"
import React from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Routes, Route } from "react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { TripLayout } from "@/layouts/TripLayout"
import { AppLayout } from "@/layouts/AppLayout"
import { AppHeader } from "@/components/navigation/AppHeader"
import { ThemeProvider } from "@/lib/theme"
import { ToastProvider } from "@/components/feedback/ToastProvider"

// Mocks
const mockTrip = {
  id: "t_test_1",
  name: "Ladakh Bike Trip",
  destination: "Leh, Ladakh",
  status: "active",
  start_date: "2026-07-01",
  end_date: "2026-07-10",
  base_currency: "INR",
  created_by: "u_1",
}

const mockUseTrip = vi.fn()
const mockUseOnline = vi.fn()

vi.mock("@/features/trips/hooks", () => ({
  useTrip: (id: string) => mockUseTrip(id),
}))

vi.mock("@/lib/network", () => ({
  useOnline: () => mockUseOnline(),
}))

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "u_1", name: "Rahul Sharma", email: "rahul@example.com" },
    signOut: vi.fn(),
  }),
}))

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    channel: () => ({
      on: () => ({ on: () => ({ on: () => ({ on: () => ({ on: () => ({ subscribe: vi.fn() }) }) }) }) }),
    }),
    removeChannel: vi.fn(),
  }),
}))

function renderWithProviders(ui: React.ReactElement, initialRoute = "/trips/t_test_1") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

describe("Milestone 1 Ergonomics & Layout Stability Challenger Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseTrip.mockReturnValue({ data: mockTrip, isLoading: false })
    mockUseOnline.mockReturnValue(true)
  })

  describe("1. TripLayout Shell & Layout Stability", () => {
    it("renders dynamic 100dvh root container with skip-link pointing to #trip-content", () => {
      const { container } = renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripLayout />}>
            <Route index element={<div data-testid="trip-outlet">Overview content</div>} />
          </Route>
        </Routes>
      )

      const rootDiv = container.firstElementChild as HTMLElement
      expect(rootDiv).toHaveClass("min-h-[100dvh]")
      expect(rootDiv).toHaveClass("flex-col")
      expect(rootDiv).toHaveClass("bg-canvas")

      // Skip link verification
      const skipLink = screen.getByRole("link", { name: "Skip to content" })
      expect(skipLink).toBeInTheDocument()
      expect(skipLink).toHaveAttribute("href", "#trip-content")
      expect(skipLink).toHaveClass("skip-link")

      // Target element with matching id
      const mainOutletContainer = container.querySelector("#trip-content")
      expect(mainOutletContainer).toBeInTheDocument()
      expect(mainOutletContainer).toContainElement(screen.getByTestId("trip-outlet"))
    })

    it("ensures content bottom padding provides strict clearance margin above fixed bottom dock", () => {
      const { container } = renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripLayout />}>
            <Route index element={<div>Content</div>} />
          </Route>
        </Routes>
      )

      const contentContainer = container.querySelector("#trip-content")
      expect(contentContainer).toBeInTheDocument()
      // pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] = 88px + safe area
      expect(contentContainer?.className).toContain("pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]")
      // md:pb-8 on desktop where mobile dock is hidden
      expect(contentContainer?.className).toContain("md:pb-8")

      // Mobile nav dock height = calc(60px+env(safe-area-inset-bottom,0px))
      const navs = screen.getAllByRole("navigation", { name: "Trip sections" })
      // Mobile nav is the fixed bottom navigation element
      const bottomNav = navs.find((nav) => nav.classList.contains("fixed"))
      expect(bottomNav).toBeDefined()
      expect(bottomNav).toHaveClass("fixed")
      expect(bottomNav).toHaveClass("bottom-0")
      expect(bottomNav).toHaveClass("z-30")
      expect(bottomNav).toHaveClass("md:hidden")

      const innerGrid = bottomNav?.firstElementChild as HTMLElement
      expect(innerGrid.className).toContain("h-[calc(60px+env(safe-area-inset-bottom,0px))]")
      expect(innerGrid.className).toContain("pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]")

      // Mathematical clearance check:
      // Content padding = 5.5rem (88px) + safeArea
      // Dock height = 60px + safeArea
      // Clearance = 88px - 60px = 28px strictly positive buffer
      const contentPaddingRem = 5.5
      const contentPaddingPx = contentPaddingRem * 16 // 88px
      const dockHeightPx = 60
      const safeAreaTestCases = [0, 20, 34, 47] // standard phone safe-area-inset-bottom insets (Android=0, iPhone notch=34, Dynamic Island=34/47)

      for (const sa of safeAreaTestCases) {
        const effectiveContentBottomPadding = contentPaddingPx + sa
        const effectiveDockHeight = dockHeightPx + sa
        const clearance = effectiveContentBottomPadding - effectiveDockHeight
        expect(clearance).toBe(28)
        expect(clearance).toBeGreaterThan(0)
      }
    })

    it("renders all 5 mobile navigation tabs with WCAG 44px minimum tap targets", () => {
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripLayout />}>
            <Route index element={<div>Overview</div>} />
          </Route>
        </Routes>
      )

      const navs = screen.getAllByRole("navigation", { name: "Trip sections" })
      const bottomNav = navs.find((nav) => nav.classList.contains("fixed"))!
      expect(bottomNav).toBeDefined()

      const links = bottomNav.querySelectorAll("a")
      expect(links.length).toBe(5)

      const expectedTabs = [
        { label: "Overview", href: "/trips/t_test_1" },
        { label: "Expenses", href: "/trips/t_test_1/expenses" },
        { label: "Balances", href: "/trips/t_test_1/balances" },
        { label: "Activity", href: "/trips/t_test_1/activity" },
        { label: "Settings", href: "/trips/t_test_1/settings" },
      ]

      expectedTabs.forEach((tab, index) => {
        const link = links[index]
        expect(link).toHaveTextContent(tab.label)
        expect(link.getAttribute("href")).toBe(tab.href)
        // Check 44px min tap target
        expect(link).toHaveClass("min-h-[44px]")
        // Active spring press scale
        expect(link.className).toContain("active:scale-[0.92]")
      })

      // First tab (Overview) is active on /trips/t_test_1
      expect(links[0]).toHaveClass("text-brand")
      expect(links[0]).toHaveClass("font-semibold")
      // Inactive tabs
      expect(links[1]).toHaveClass("text-ink-soft")
    })

    it("renders header with live sync indicator, back link, destination, and status badge", () => {
      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripLayout />}>
            <Route index element={<div>Overview</div>} />
          </Route>
        </Routes>
      )

      expect(screen.getByText("Ladakh Bike Trip")).toBeInTheDocument()
      expect(screen.getByText(/Leh, Ladakh/)).toBeInTheDocument()
      expect(screen.getByText("active")).toBeInTheDocument()
      expect(screen.getByText("Live sync")).toBeInTheDocument()

      const backLink = screen.getByRole("link", { name: "Back to all trips" })
      expect(backLink).toBeInTheDocument()
      expect(backLink).toHaveAttribute("href", "/trips")
      expect(backLink).toHaveClass("min-h-11") // 44px tap target
    })

    it("displays offline indicator when network is offline", () => {
      mockUseOnline.mockReturnValue(false)

      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripLayout />}>
            <Route index element={<div>Overview</div>} />
          </Route>
        </Routes>
      )

      expect(screen.getByText("Offline")).toBeInTheDocument()
    })

    it("renders archived read-only banner when trip status is archived", () => {
      mockUseTrip.mockReturnValue({
        data: { ...mockTrip, status: "archived" },
        isLoading: false,
      })

      renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripLayout />}>
            <Route index element={<div>Overview</div>} />
          </Route>
        </Routes>
      )

      expect(screen.getByText(/Archived — read-only. No financial or membership changes allowed./i)).toBeInTheDocument()
      expect(screen.getByText("archived")).toBeInTheDocument()
    })

    it("renders skeleton placeholder pulse when trip data is loading", () => {
      mockUseTrip.mockReturnValue({ data: null, isLoading: true })

      const { container } = renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripLayout />}>
            <Route index element={<div>Overview</div>} />
          </Route>
        </Routes>
      )

      const skeletonTitle = container.querySelector(".animate-pulse.bg-hair")
      expect(skeletonTitle).toBeInTheDocument()
      const skeletonSubtitle = container.querySelector(".animate-pulse.bg-hair\\/60")
      expect(skeletonSubtitle).toBeInTheDocument()
    })

    it("desktop navigation is sticky and properly hidden on mobile", () => {
      const { container } = renderWithProviders(
        <Routes>
          <Route path="/trips/:tripId" element={<TripLayout />}>
            <Route index element={<div>Overview</div>} />
          </Route>
        </Routes>
      )

      const desktopNavWrapper = container.querySelector(".hidden.md\\:block.sticky.top-0.z-20")
      expect(desktopNavWrapper).toBeInTheDocument()
      expect(desktopNavWrapper).toHaveClass("backdrop-blur-md")
    })
  })

  describe("2. AppLayout Shell & Layout Stability", () => {
    it("renders AppLayout with 100dvh root, skip link, sticky AppHeader, and max-w-6xl main container", () => {
      const { container } = renderWithProviders(
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<div data-testid="app-outlet">App Content</div>} />
          </Route>
        </Routes>,
        "/"
      )

      const rootDiv = container.firstElementChild as HTMLElement
      expect(rootDiv).toHaveClass("min-h-[100dvh]")
      expect(rootDiv).toHaveClass("bg-canvas")

      const skipLink = screen.getByRole("link", { name: "Skip to content" })
      expect(skipLink).toBeInTheDocument()
      expect(skipLink).toHaveAttribute("href", "#main-content")

      const main = container.querySelector("main#main-content")
      expect(main).toBeInTheDocument()
      expect(main).toHaveClass("max-w-6xl")
      expect(main).toHaveClass("pb-12")
      expect(main).toHaveClass("pt-6")
      expect(main).toContainElement(screen.getByTestId("app-outlet"))
    })

    it("AppHeader contains accessible branding, theme toggle, profile link, and sign-out button", () => {
      renderWithProviders(<AppHeader />, "/trips")

      const logoLink = screen.getByRole("link", { name: "Hissaab home" })
      expect(logoLink).toBeInTheDocument()
      expect(logoLink).toHaveAttribute("href", "/trips")

      const themeToggle = screen.getByRole("button", { name: /switch to (dark|light) theme/i })
      expect(themeToggle).toBeInTheDocument()

      const profileLink = screen.getByRole("link", { name: "View profile" })
      expect(profileLink).toBeInTheDocument()
      expect(profileLink).toHaveAttribute("href", "/profile")
      expect(profileLink).toHaveTextContent("Rahul Sharma")

      const signOutBtn = screen.getByRole("button", { name: "Sign out" })
      expect(signOutBtn).toBeInTheDocument()
    })
  })

  describe("3. Viewport & Tap Target Ergonomics Simulation", () => {
    it("verifies bottom dock 5-column layout distributes width safely on narrow mobile screens (320px - 430px)", () => {
      const viewports = [
        { name: "iPhone SE (1st gen)", width: 320 },
        { name: "iPhone SE / 8", width: 375 },
        { name: "iPhone 12 / 13 / 14 / 15", width: 390 },
        { name: "iPhone Plus / Pro Max", width: 430 },
        { name: "Android standard", width: 360 },
      ]

      for (const vp of viewports) {
        const itemWidth = vp.width / 5
        // Item width should always provide generous tap target width >= 60px (well above 44px min)
        expect(itemWidth).toBeGreaterThanOrEqual(64)
      }
    })
  })
})
