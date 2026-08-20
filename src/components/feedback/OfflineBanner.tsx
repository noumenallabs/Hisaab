import { useOnline } from "@/lib/network"

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div role="status" aria-live="polite" aria-label="Offline — writes paused" className="sticky top-0 z-30 bg-[#c53c34] px-4 py-2.5 text-center text-sm font-semibold text-white">
      You’re offline — writes are paused. Read-only view remains.
    </div>
  )
}
