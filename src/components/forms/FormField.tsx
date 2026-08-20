import type { ReactNode } from "react"

export function FormField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-ink-soft mb-1.5">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-faint">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-owe">{error}</span>}
    </label>
  )
}
