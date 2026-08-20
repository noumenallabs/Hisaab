import { createBrowserRouter, Navigate, Link } from "react-router"
import { lazy, Suspense } from "react"
import { AuthGuard, GuestGuard } from "./guards/AuthGuard"
import { AdminGuard } from "./guards/AdminGuard"
import { TripGuard } from "./guards/TripGuard"
import { AppLayout } from "@/layouts/AppLayout"
import { TripLayout } from "@/layouts/TripLayout"
import { FullPageSkeleton } from "@/components/feedback/Skeleton"

const SignInPage = lazy(() => import("@/features/auth/SignInPage").then(m => ({ default: m.SignInPage })))
const SignUpPage = lazy(() => import("@/features/auth/SignUpPage").then(m => ({ default: m.SignUpPage })))
const ForgotPasswordPage = lazy(() => import("@/features/auth/ForgotPasswordPage").then(m => ({ default: m.ForgotPasswordPage })))
const VerifyEmailPage = lazy(() => import("@/features/auth/VerifyEmailPage").then(m => ({ default: m.VerifyEmailPage })))
const ResetPasswordPage = lazy(() => import("@/features/auth/ResetPasswordPage").then(m => ({ default: m.ResetPasswordPage })))
const AuthCallbackPage = lazy(() => import("@/features/auth/AuthCallbackPage").then(m => ({ default: m.AuthCallbackPage })))
const InviteJoinPage = lazy(() => import("@/features/auth/InviteJoinPage").then(m => ({ default: m.InviteJoinPage })))
const TripsPage = lazy(() => import("@/features/trips/TripsPage").then(m => ({ default: m.TripsPage })))
const CreateTripPage = lazy(() => import("@/features/trips/CreateTripPage").then(m => ({ default: m.CreateTripPage })))
const JoinTripPage = lazy(() => import("@/features/trips/JoinTripPage").then(m => ({ default: m.JoinTripPage })))
const ProfilePage = lazy(() => import("@/features/profile/ProfilePage").then(m => ({ default: m.ProfilePage })))
const ExpensesPage = lazy(() => import("@/features/expenses/ExpensesPage").then(m => ({ default: m.ExpensesPage })))
const ExpenseFormPage = lazy(() => import("@/features/expenses/ExpenseFormPage").then(m => ({ default: m.ExpenseFormPage })))
const ExpenseDetailPage = lazy(() => import("@/features/expenses/ExpenseDetailPage").then(m => ({ default: m.ExpenseDetailPage })))
const BalancesPage = lazy(() => import("@/features/balances/BalancesPage").then(m => ({ default: m.BalancesPage })))
const ActivityPage = lazy(() => import("@/features/activity/ActivityPage").then(m => ({ default: m.ActivityPage })))
const TripSettingsPage = lazy(() => import("@/features/settings/TripSettingsPage").then(m => ({ default: m.TripSettingsPage })))
const TripOverviewPage = lazy(() => import("@/features/trips/TripOverviewPage").then(m => ({ default: m.TripOverviewPage })))

function SuspenseOutlet({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<FullPageSkeleton />}>{children}</Suspense>
}

function AdminStub() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
      <div>
        <p className="font-mono text-xs font-bold tracking-widest text-brand">
          PLATFORM ADMIN
        </p>
        <h1 className="mt-3 text-3xl font-bold">Coming later</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-ink-soft">
          The reserved admin route will be gated by the Supabase profile’s
          is_platform_admin claim.
        </p>
      </div>
    </main>
  )
}

function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-6 text-center">
      <div>
        <h1 className="text-3xl font-bold">404 — Not found</h1>
        <p className="mt-2 text-sm text-ink-soft">The page you requested does not exist.</p>
        <Link to="/trips" className="mt-4 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-bold text-white">Go to trips</Link>
      </div>
    </main>
  )
}

function validateReturnTo(to: string | null): string {
  if (!to) return "/trips"
  try {
    const u = new URL(to, window.location.origin)
    if (u.origin !== window.location.origin) return "/trips"
    if (!u.pathname.startsWith("/")) return "/trips"
    return u.pathname + u.search + u.hash
  } catch { return "/trips" }
}
// Export for use in auth pages
export { validateReturnTo }

import { RouteErrorBoundary } from "./errors/ErrorBoundary"

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/trips" replace />, errorElement: <RouteErrorBoundary /> },
  { path: "/join", element: <SuspenseOutlet><InviteJoinPage /></SuspenseOutlet>, errorElement: <RouteErrorBoundary /> },
  { path: "/join/:code", element: <SuspenseOutlet><InviteJoinPage /></SuspenseOutlet>, errorElement: <RouteErrorBoundary /> },
  {
    element: <GuestGuard />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: "/sign-in", element: <SuspenseOutlet><SignInPage /></SuspenseOutlet> },
      { path: "/sign-up", element: <SuspenseOutlet><SignUpPage /></SuspenseOutlet> },
      { path: "/forgot-password", element: <SuspenseOutlet><ForgotPasswordPage /></SuspenseOutlet> },
      { path: "/verify-email", element: <SuspenseOutlet><VerifyEmailPage /></SuspenseOutlet> },
      { path: "/reset-password", element: <SuspenseOutlet><ResetPasswordPage /></SuspenseOutlet> },
      { path: "/auth/callback", element: <SuspenseOutlet><AuthCallbackPage /></SuspenseOutlet> },
    ],
  },
  {
    element: <AuthGuard />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <AppLayout />,
        errorElement: <RouteErrorBoundary />,
        children: [
          { path: "/trips", element: <SuspenseOutlet><TripsPage /></SuspenseOutlet> },
          { path: "/trips/new", element: <SuspenseOutlet><CreateTripPage /></SuspenseOutlet> },
          {
            element: <AdminGuard />,
            errorElement: <RouteErrorBoundary />,
            children: [
              { path: "/admin", element: <AdminStub /> },
            ],
          },
          { path: "/join-admin", element: <SuspenseOutlet><JoinTripPage /></SuspenseOutlet> },
          { path: "/profile", element: <SuspenseOutlet><ProfilePage /></SuspenseOutlet> },
        ],
      },
      {
        path: "/trips/:tripId",
        element: <TripGuard />,
        errorElement: <RouteErrorBoundary />,
        children: [
          {
            element: <TripLayout />,
            errorElement: <RouteErrorBoundary />,
            children: [
              { index: true, element: <SuspenseOutlet><TripOverviewPage /></SuspenseOutlet> },
              { path: "expenses", element: <SuspenseOutlet><ExpensesPage /></SuspenseOutlet> },
              { path: "expenses/new", element: <SuspenseOutlet><ExpenseFormPage /></SuspenseOutlet> },
              { path: "expenses/:expenseId", element: <SuspenseOutlet><ExpenseDetailPage /></SuspenseOutlet> },
              { path: "expenses/:expenseId/edit", element: <SuspenseOutlet><ExpenseFormPage /></SuspenseOutlet> },
              { path: "balances", element: <SuspenseOutlet><BalancesPage /></SuspenseOutlet> },
              { path: "activity", element: <SuspenseOutlet><ActivityPage /></SuspenseOutlet> },
              { path: "settings", element: <SuspenseOutlet><TripSettingsPage /></SuspenseOutlet> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
])
