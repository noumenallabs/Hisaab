import { LogOut } from "lucide-react"
import { Link, useNavigate } from "react-router"
import { useAuth } from "@/lib/auth"
import { HissaabLogo } from "./HissaabLogo"
import { ThemeToggle } from "./ThemeToggle"
import { UserAvatar } from "@/components/feedback/UserAvatar"

export function AppHeader() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  return (
    <header className="flex items-center justify-between border-b border-hair pb-5">
      <Link
        to="/trips"
        className="group inline-flex items-center"
        aria-label="Hissaab home"
      >
        <HissaabLogo size={36} textSize="text-xl" />
      </Link>
      <div className="flex items-center gap-2.5 sm:gap-3">
        <ThemeToggle />
        <Link
          to="/profile"
          className="flex items-center gap-2.5 rounded-xl border border-hair bg-surface px-3 py-1.5 hover:bg-canvas transition-colors shadow-2xs"
          aria-label="View profile"
        >
          <UserAvatar
            name={user?.name ?? "?"}
            id={user?.id}
            isCurrentUser={true}
            size="md"
          />
          <span className="hidden text-left text-xs text-ink-soft sm:block">
            <b className="block text-ink">{user?.name}</b>
            <span className="text-[10px] text-ink-faint">{user?.email}</span>
          </span>
        </Link>
        <button
          onClick={async () => {
            await signOut()
            navigate("/sign-in")
          }}
          className="grid h-9 w-9 place-items-center rounded-xl border border-hair text-ink-soft hover:bg-canvas hover:text-owe transition-colors shadow-2xs"
          aria-label="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
