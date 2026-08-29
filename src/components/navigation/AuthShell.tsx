import { Link, NavLink, useLocation } from "react-router"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { HissaabLogo } from "./HissaabLogo"
import { ThemeToggle } from "./ThemeToggle"

type Props = {
  title: string
  subtitle?: string
  backTo?: string
  backLabel?: string
  showTabs?: boolean
  children: React.ReactNode
}

export function AuthShell({
  title,
  subtitle,
  backTo,
  backLabel = "Back",
  showTabs = true,
  children,
}: Props) {
  const location = useLocation()
  const search = location.search

  return (
    <main className="min-h-[100dvh] bg-canvas p-4 sm:grid sm:place-items-center py-8">
      <div className="w-full max-w-[480px]">
        {/* Top App Header Bar */}
        <div className="flex items-center justify-between pb-4">
          {backTo ? (
            <Link
              to={backTo}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
            >
              <ArrowLeft size={16} /> {backLabel}
            </Link>
          ) : (
            <Link
              to="/trips"
              className="inline-flex items-center"
              aria-label="Hissaab home"
            >
              <HissaabLogo size={32} textSize="text-base" />
            </Link>
          )}

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/trips"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              All trips <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {/* Card Container */}
        <div className="overflow-hidden rounded-2xl border border-hair bg-surface shadow-xs">
          {/* Segmented Auth Navigation Tabs */}
          {showTabs && (
            <div className="grid grid-cols-3 border-b border-hair bg-canvas/60 p-1.5 text-xs font-bold">
              <NavLink
                to={`/sign-in${search}`}
                className={({ isActive }) =>
                  `flex items-center justify-center rounded-xl py-2.5 transition-all active:scale-[0.98] ${
                    isActive
                      ? "bg-surface text-brand shadow-xs"
                      : "text-ink-soft hover:text-ink"
                  }`
                }
              >
                Sign In
              </NavLink>
              <NavLink
                to={`/sign-up${search}`}
                className={({ isActive }) =>
                  `flex items-center justify-center rounded-xl py-2.5 transition-all active:scale-[0.98] ${
                    isActive
                      ? "bg-surface text-brand shadow-xs"
                      : "text-ink-soft hover:text-ink"
                  }`
                }
              >
                Sign Up
              </NavLink>
              <NavLink
                to={`/join${search}`}
                className={({ isActive }) =>
                  `flex items-center justify-center rounded-xl py-2.5 transition-all active:scale-[0.98] ${
                    isActive
                      ? "bg-surface text-brand shadow-xs"
                      : "text-ink-soft hover:text-ink"
                  }`
                }
              >
                Join by Code
              </NavLink>
            </div>
          )}

          {/* Header Banner */}
          <div className="border-b border-hair bg-canvas/40 px-7 py-6">
            <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-xs text-ink-soft leading-5">{subtitle}</p>}
          </div>

          {/* Form Content */}
          <div className="p-7">{children}</div>
        </div>
      </div>
    </main>
  )
}
