import { createContext, useContext, useState, type ReactNode } from "react"

type Toast = { id: number; message: string; kind: "info" | "success" | "error" }
const Ctx = createContext<{ toast: (m: string, kind?: Toast["kind"]) => void } | null>(null)
export function useToast() {
  const v = useContext(Ctx)
  if (!v) throw new Error("no toast")
  return v
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  function toast(message: string, kind: Toast["kind"] = "info") {
    const id = Date.now() + Math.random()
    setToasts((p) => [...p, { id, message, kind }])
    // error persists until dismissed per spec §6.2
    const ttl = kind === "error" ? 5000 : 2600
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), ttl)
  }
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-20 left-1/2 z-50 max-w-[min(90vw,420px)] -translate-x-1/2 space-y-2 sm:bottom-4"
        aria-live="polite"
        aria-atomic="false"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            aria-live={t.kind === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-md px-4 py-2 text-sm shadow-lg ${
              t.kind === "error" ? "bg-owe text-white" : t.kind === "success" ? "bg-owed text-white" : "bg-ink text-white"
            }`}
          >
            <span>{t.message}</span>
            {t.kind === "error" && (
              <button
                onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
                className="min-h-11 rounded px-2 text-xs font-bold underline"
                aria-label="Dismiss error"
              >
                Dismiss
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
