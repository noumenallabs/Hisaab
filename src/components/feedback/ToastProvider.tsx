import { createContext, useContext, useState, type ReactNode } from "react"
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react"

type Toast = { id: number; message: string; kind: "info" | "success" | "error" }
const Ctx = createContext<{ toast: (m: string, kind?: Toast["kind"]) => void } | null>(null)
const defaultToastCtx = { toast: (_m: string, _kind?: any) => {} }
export function useToast() {
  const v = useContext(Ctx)
  return v ?? defaultToastCtx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  function toast(message: string, kind: Toast["kind"] = "info") {
    const id = Date.now() + Math.random()
    setToasts((p) => [...p, { id, message, kind }])
    // error persists until dismissed per spec §6.2
    const ttl = kind === "error" ? 6000 : 2800
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), ttl)
  }
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-20 left-1/2 z-50 flex w-full max-w-[min(92vw,440px)] -translate-x-1/2 flex-col gap-2.5 sm:bottom-6"
        aria-live="polite"
        aria-atomic="false"
        role="status"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            aria-live={t.kind === "error" ? "assertive" : "polite"}
            className={`animate-toast-in pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold backdrop-blur-xl transition-all ${
              t.kind === "error"
                ? "border-owe/40 bg-surface/95 text-ink shadow-glow-owe"
                : t.kind === "success"
                ? "border-owed/40 bg-surface/95 text-ink shadow-glow-owed"
                : "border-hair bg-surface/95 text-ink shadow-glow-brand"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className={`animate-badge-pop flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${
                  t.kind === "error"
                    ? "bg-owe/15 text-owe"
                    : t.kind === "success"
                    ? "bg-owed/15 text-owed"
                    : "bg-brand/15 text-brand"
                }`}
              >
                {t.kind === "error" ? (
                  <AlertCircle className="h-4 w-4" />
                ) : t.kind === "success" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Info className="h-4 w-4" />
                )}
              </span>
              <span className="truncate text-ink">{t.message}</span>
            </div>
            <button
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-soft hover:bg-canvas hover:text-ink active:scale-[0.90] transition-all cursor-pointer"
              aria-label="Dismiss toast"
            >
              <X className="h-4 w-4 opacity-70 hover:opacity-100" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
