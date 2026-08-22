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
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-md transition-all ${
              t.kind === "error"
                ? "border border-red-200 bg-red-600 text-white shadow-red-950/20 dark:border-red-800/80 dark:bg-red-950/90 dark:text-red-100"
                : t.kind === "success"
                ? "border border-emerald-200 bg-emerald-700 text-white shadow-emerald-950/20 dark:border-emerald-800/80 dark:bg-emerald-950/90 dark:text-emerald-100"
                : "border border-slate-700/40 bg-slate-900 text-white shadow-slate-950/30 dark:border-slate-700 dark:bg-slate-800/95 dark:text-slate-100"
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {t.kind === "error" ? (
                <AlertCircle className="h-4 w-4 shrink-0 text-red-100 dark:text-red-400" />
              ) : t.kind === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-100 dark:text-emerald-400" />
              ) : (
                <Info className="h-4 w-4 shrink-0 text-blue-200 dark:text-blue-400" />
              )}
              <span className="truncate">{t.message}</span>
            </div>
            <button
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Dismiss toast"
            >
              <X className="h-4 w-4 opacity-80 hover:opacity-100" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
