import { Sun, Moon } from "lucide-react"
import { useTheme } from "@/lib/theme"

interface ThemeToggleProps {
  className?: string
  size?: number
}

export function ThemeToggle({ className = "", size = 16 }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`grid h-9 w-9 place-items-center rounded-xl border border-hair text-ink-soft hover:text-ink hover:bg-canvas transition-colors shadow-2xs ${className}`}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? (
        <Sun size={size} className="text-amber-400 transition-transform duration-200 rotate-0 hover:rotate-45" />
      ) : (
        <Moon size={size} className="text-ink-soft transition-transform duration-200 rotate-0 hover:-rotate-12" />
      )}
    </button>
  )
}
