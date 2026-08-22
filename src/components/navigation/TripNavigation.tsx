import { NavLink } from "react-router"
import { Home, Receipt, Scale, Activity as ActivityIcon, Settings2 } from "lucide-react"

const tabs = [
  { to: "", label: "Overview", icon: Home },
  { to: "expenses", label: "Expenses", icon: Receipt },
  { to: "balances", label: "Balances", icon: Scale },
  { to: "activity", label: "Activity", icon: ActivityIcon },
  { to: "settings", label: "Settings", icon: Settings2 },
]

export function TripNavigation({
  tripId,
  base,
}: {
  tripId: string; base: string
}) {
  return (
    <nav className="flex w-full gap-1 overflow-x-auto border-b border-hair bg-surface px-4 sm:px-8" style={{ scrollbarWidth: "thin" }} aria-label="Trip sections">
      {tabs.map((t) => {
        const to = t.to ? `${base}/${t.to}` : base
        const Icon = t.icon
        return (
          <NavLink
            key={t.label}
            to={to}
            end={!t.to}
            className={({ isActive }) =>
              `inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-all rounded-t-lg focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2 ${
                isActive
                  ? "border-brand text-brand font-bold"
                  : "border-transparent text-ink-soft hover:text-ink hover:border-hair"
              }`
            }
          >
            <Icon size={16} />
            <span>{t.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
