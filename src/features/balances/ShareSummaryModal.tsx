import { useEffect, useState, useMemo } from "react"
import { createPortal } from "react-dom"
import {
  type SummaryCardOptions,
  generateSummaryImageDataUrl,
  shareSummaryImageCard,
  downloadSummaryImage,
} from "./generateSummaryCanvas"
import { generateTripShareText, shareTripSummary } from "./shareSummary"
import { useToast } from "@/components/feedback/ToastProvider"
import { Share2, Download, Copy, X, Check, Image as ImageIcon, MessageCircle } from "lucide-react"

export function ShareSummaryModal({
  open,
  onClose,
  opts,
}: {
  open: boolean
  onClose: () => void
  opts: SummaryCardOptions
}) {
  const { toast } = useToast()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [copiedText, setCopiedText] = useState(false)
  const [sharing, setSharing] = useState(false)

  const tripUrl = typeof window !== "undefined" ? window.location.href : ""

  useEffect(() => {
    if (!open) {
      setPreviewUrl(null)
      return
    }
    // Generate snapshot card on open
    try {
      const url = generateSummaryImageDataUrl(opts)
      setPreviewUrl(url)
    } catch (err) {
      console.error("Failed to generate preview image", err)
    }
  }, [open, opts])

  if (!open) return null

  const shareText = generateTripShareText({
    tripName: opts.tripName,
    currency: opts.currency,
    totalMinor: opts.totalMinor,
    expenseCount: opts.expenseCount,
    transfers: opts.transfers,
    tripUrl,
  })

  async function handleShareImage() {
    setSharing(true)
    try {
      const res = await shareSummaryImageCard(opts, tripUrl)
      if (res === "shared_image") {
        toast("Summary snapshot shared!", "success")
      } else {
        toast("Summary image saved to Downloads!", "success")
      }
    } catch (e: any) {
      downloadSummaryImage(opts)
      toast("Summary image downloaded!", "success")
    } finally {
      setSharing(false)
    }
  }

  async function handleCopyText() {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText)
      } else {
        const ta = document.createElement("textarea")
        ta.value = shareText
        document.body.appendChild(ta)
        ta.select()
        document.execCommand("copy")
        document.body.removeChild(ta)
      }
      setCopiedText(true)
      toast("Text summary copied to clipboard!", "success")
      setTimeout(() => setCopiedText(false), 2500)
    } catch {
      toast("Failed to copy text", "error")
    }
  }

  function handleShareWhatsApp() {
    const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`
    window.open(waUrl, "_blank", "noopener,noreferrer")
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-hair bg-surface p-6 shadow-2xl space-y-5 my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hair/50 pb-3">
          <div>
            <h2 id="share-modal-title" className="text-lg font-bold tracking-tight text-ink">
              Share Trip Summary
            </h2>
            <p className="text-xs text-ink-soft">
              Snapshot card & WhatsApp statement for {opts.tripName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-canvas hover:text-ink transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Snapshot Card Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-ink-soft">
            <span className="flex items-center gap-1.5">
              <ImageIcon size={14} className="text-brand" /> Visual Snapshot Card
            </span>
            <span className="text-[11px] text-ink-faint">HD PNG · 1000px</span>
          </div>

          <div className="relative max-h-72 overflow-y-auto rounded-xl border border-hair bg-slate-950 p-2 shadow-inner">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Trip Summary Snapshot Preview"
                className="w-full h-auto rounded-lg object-contain shadow-md"
              />
            ) : (
              <div className="h-48 flex items-center justify-center text-xs text-ink-faint animate-pulse">
                Rendering snapshot card…
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          {/* Share/Save Image Button */}
          <button
            type="button"
            onClick={handleShareImage}
            disabled={sharing}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Share2 size={16} />
            {sharing ? "Preparing Image…" : "📸 Share / Save Image Card"}
          </button>

          {/* 2 Sub-actions: Copy Text & WhatsApp */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-hair bg-canvas/60 px-3 text-xs font-bold text-ink shadow-2xs hover:bg-canvas transition-colors"
            >
              {copiedText ? (
                <>
                  <Check size={14} className="text-emerald-500" /> Copied!
                </>
              ) : (
                <>
                  <Copy size={14} /> Copy Text
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 shadow-2xs hover:bg-emerald-500/20 transition-colors"
            >
              <MessageCircle size={14} /> WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
