import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  danger,
  pending,
  error,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description: string
  confirmLabel?: string
  danger?: boolean
  pending?: boolean
  error?: string | null
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose()
      if (e.key === "Tab") {
        const dialog = document.getElementById("confirm-dialog")
        if (!dialog) return
        const nodes = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
          )
        ).filter((el) => !el.hasAttribute("disabled"))
        if (!nodes.length) return
        const first = nodes[0],
          last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", h)
    document.body.style.overflow = "hidden"
    const appRoot = document.getElementById("root")
    if (appRoot) appRoot.setAttribute("aria-hidden", "true")

    return () => {
      window.removeEventListener("keydown", h)
      document.body.style.overflow = ""
      if (appRoot) appRoot.removeAttribute("aria-hidden")
      prevFocus.current?.focus()
    }
  }, [open, onClose, pending])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
    >
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={() => {
          if (!pending) onClose()
        }}
        aria-hidden="true"
      />
      <div
        id="confirm-dialog"
        className="relative w-full border-t sm:border border-hair bg-surface p-6 shadow-2xl max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-3xl max-sm:max-h-[90dvh] max-sm:overflow-y-auto max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:max-w-md sm:rounded-2xl sm:my-8 animate-in slide-in-from-bottom duration-250 sm:slide-in-from-bottom-0 sm:fade-in sm:zoom-in-95"
      >
        {/* Mobile Grab Bar */}
        <div className="sm:hidden -mt-2 mb-4 flex justify-center" aria-hidden="true">
          <div className="h-1.5 w-12 rounded-full bg-hair" />
        </div>

        <h2 id="confirm-title" className="text-lg font-bold text-ink">
          {title}
        </h2>
        <p id="confirm-desc" className="mt-2 text-sm leading-6 text-ink-soft">
          {description}
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-owe/10 px-3 py-2 text-sm text-owe">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={!!pending}
            className="min-h-11 rounded-xl border border-hair bg-surface px-5 text-sm font-semibold text-ink hover:bg-canvas disabled:opacity-50 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer"
          >
            Cancel
          </button>
          <button
            disabled={!!pending}
            onClick={() => {
              const r = onConfirm()
              if (!(r instanceof Promise)) onClose()
            }}
            className={`min-h-11 rounded-xl px-5 text-sm font-bold text-white shadow-sm disabled:opacity-50 active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 cursor-pointer ${
              danger ? "bg-owe hover:bg-red-700" : "bg-brand hover:bg-blue-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
