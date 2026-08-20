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
      className="fixed inset-0 z-50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-desc"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!pending) onClose()
        }}
        aria-hidden="true"
      />
      <div
        id="confirm-dialog"
        className="relative w-full max-w-md rounded-xl bg-surface p-6 shadow-2xl"
      >
        <h2 id="confirm-title" className="text-lg font-bold">
          {title}
        </h2>
        <p id="confirm-desc" className="mt-2 text-sm leading-6 text-ink-soft">
          {description}
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-owe/10 px-3 py-2 text-sm text-owe">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={!!pending}
            className="min-h-11 rounded-xl border border-hair bg-surface px-4 text-sm font-semibold text-ink hover:bg-canvas disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!!pending}
            onClick={() => {
              const r = onConfirm()
              if (!(r instanceof Promise)) onClose()
            }}
            className={`min-h-11 rounded-xl px-5 text-sm font-bold text-white shadow-sm transition-colors ${
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
