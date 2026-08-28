const AVATAR_PALETTES = [
  "bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/60",
  "bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200/60 dark:border-purple-800/60",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/60",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/60",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200/60 dark:border-rose-800/60",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-800/60",
  "bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300 border-teal-200/60 dark:border-teal-800/60",
]

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function UserAvatar({
  name,
  id,
  avatar,
  isCurrentUser = false,
  size = "md",
  className = "",
}: {
  name?: string
  id?: string
  avatar?: string
  isCurrentUser?: boolean
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  className?: string
}) {
  const displayName = name || (id ? id.replace(/^u_/, "") : "?")
  const seed = id || displayName
  const paletteIndex = hashString(seed) % AVATAR_PALETTES.length
  const palette = AVATAR_PALETTES[paletteIndex]

  const sizeClasses = {
    xs: "h-5 w-5 text-[9px]",
    sm: "h-6 w-6 text-[10px]",
    md: "h-7 w-7 text-xs",
    lg: "h-9 w-9 text-sm",
    xl: "h-16 w-16 text-xl font-extrabold",
  }[size]

  const initial = avatar || (displayName.trim()[0] || "?").toUpperCase()
  const titleText = isCurrentUser ? `${displayName} (You)` : displayName

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full font-bold border transition-all ${sizeClasses} ${palette} ${
        isCurrentUser ? "ring-2 ring-brand ring-offset-1 ring-offset-surface shadow-2xs" : ""
      } ${className}`}
      title={titleText}
      aria-label={displayName}
    >
      {initial}
    </span>
  )
}
