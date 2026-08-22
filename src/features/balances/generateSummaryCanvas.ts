import { formatMinor } from "@/lib/currency"

export type SummaryTransfer = {
  fromName: string
  toName: string
  amountMinor: number
}

export type SummaryCategory = {
  label: string
  emoji: string
  totalMinor: number
  percentage: number
}

export type SummaryCardOptions = {
  tripName: string
  currency: string
  totalMinor: number
  expenseCount: number
  memberCount: number
  transfers: SummaryTransfer[]
  categories?: SummaryCategory[]
  destination?: string
  dates?: string
}

export function prepareSummaryCardData(opts: SummaryCardOptions) {
  const { tripName, currency, totalMinor, expenseCount, memberCount, transfers, categories = [] } = opts
  const formattedTotal = formatMinor(totalMinor, currency)
  const isSettled = transfers.length === 0

  return {
    tripTitle: tripName,
    currency,
    formattedTotal,
    expenseCountLabel: `${expenseCount} ${expenseCount === 1 ? "transaction" : "transactions"}`,
    memberCountLabel: `${memberCount} ${memberCount === 1 ? "traveler" : "travelers"}`,
    isSettled,
    transfers,
    categories: categories.filter((c) => c.totalMinor > 0),
  }
}

const CATEGORY_COLORS = ["#6366F1", "#F59E0B", "#F97316", "#A855F7", "#EC4899", "#64748B"]

export function renderSummaryCardCanvas(opts: SummaryCardOptions): HTMLCanvasElement {
  const data = prepareSummaryCardData(opts)
  const width = 1000

  // Calculate height dynamically
  const baseHeight = 620
  const categoryHeight = data.categories.length > 0 ? 180 + Math.ceil(data.categories.length / 2) * 55 : 0
  const transferItemHeight = 65
  const transfersCount = Math.max(1, data.transfers.length)
  const transferHeight = 120 + transfersCount * transferItemHeight
  const height = baseHeight + categoryHeight + transferHeight

  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return canvas

  // 1. Background Gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height)
  bgGrad.addColorStop(0, "#090D16")
  bgGrad.addColorStop(0.5, "#0F172A")
  bgGrad.addColorStop(1, "#1E293B")
  ctx.fillStyle = bgGrad
  ctx.fillRect(0, 0, width, height)

  // Subtle decorative ambient glow
  const glowGrad = ctx.createRadialGradient(width - 150, 150, 10, width - 150, 150, 400)
  glowGrad.addColorStop(0, "rgba(59, 130, 246, 0.18)")
  glowGrad.addColorStop(1, "rgba(59, 130, 246, 0)")
  ctx.fillStyle = glowGrad
  ctx.fillRect(0, 0, width, height)

  // Outer border with rounded corners
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)"
  ctx.lineWidth = 4
  roundRect(ctx, 20, 20, width - 40, height - 40, 24)
  ctx.stroke()

  let y = 80

  // 2. Brand Tag / Header Pill
  ctx.fillStyle = "rgba(59, 130, 246, 0.2)"
  roundRect(ctx, 60, y, 220, 36, 18)
  ctx.fill()
  ctx.strokeStyle = "rgba(96, 165, 250, 0.4)"
  ctx.lineWidth = 1.5
  roundRect(ctx, 60, y, 220, 36, 18)
  ctx.stroke()

  ctx.fillStyle = "#93C5FD"
  ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  ctx.fillText("✨ HISSAAB STATEMENT", 80, y + 23)

  y += 75

  // 3. Trip Title
  ctx.fillStyle = "#FFFFFF"
  ctx.font = "bold 38px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  const title = data.tripTitle.length > 35 ? data.tripTitle.slice(0, 33) + "…" : data.tripTitle
  ctx.fillText(title, 60, y)

  y += 32

  // Destination / Dates Subtitle
  const subParts = []
  if (opts.destination) subParts.push(`📍 ${opts.destination}`)
  if (opts.dates) subParts.push(`🗓️ ${opts.dates}`)
  if (subParts.length > 0) {
    ctx.fillStyle = "#94A3B8"
    ctx.font = "500 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    ctx.fillText(subParts.join("  ·  "), 60, y)
    y += 40
  } else {
    y += 20
  }

  // 4. Metric Stat Cards Row (3 Cards)
  const cardWidth = (width - 120 - 32) / 3
  const cardHeight = 115
  const metrics = [
    { label: "TOTAL SPENDING", val: data.formattedTotal, sub: `In ${data.currency}`, color: "#38BDF8" },
    { label: "TRANSACTIONS", val: String(opts.expenseCount), sub: "Recorded entries", color: "#A78BFA" },
    { label: "TRAVELERS", val: String(opts.memberCount), sub: "Trip participants", color: "#34D399" },
  ]

  metrics.forEach((m, idx) => {
    const cardX = 60 + idx * (cardWidth + 16)
    ctx.fillStyle = "rgba(30, 41, 59, 0.7)"
    roundRect(ctx, cardX, y, cardWidth, cardHeight, 16)
    ctx.fill()
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)"
    ctx.lineWidth = 1.5
    roundRect(ctx, cardX, y, cardWidth, cardHeight, 16)
    ctx.stroke()

    ctx.fillStyle = "#94A3B8"
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    ctx.fillText(m.label, cardX + 20, y + 32)

    ctx.fillStyle = m.color
    ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    ctx.fillText(m.val, cardX + 20, y + 70)

    ctx.fillStyle = "#64748B"
    ctx.font = "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    ctx.fillText(m.sub, cardX + 20, y + 95)
  })

  y += cardHeight + 45

  // 5. Category Breakdown Section
  if (data.categories.length > 0) {
    ctx.fillStyle = "#E2E8F0"
    ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    ctx.fillText("📊 SPENDING BY CATEGORY", 60, y)
    y += 20

    // Multi-color distribution bar
    const barWidth = width - 120
    const barHeight = 14
    let currentX = 60

    ctx.save()
    roundRect(ctx, 60, y, barWidth, barHeight, 7)
    ctx.clip()

    data.categories.forEach((cat, idx) => {
      const segWidth = Math.max(4, (cat.percentage / 100) * barWidth)
      ctx.fillStyle = CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
      ctx.fillRect(currentX, y, segWidth, barHeight)
      currentX += segWidth
    })
    ctx.restore()

    y += 35

    // Category Grid Pills (2 columns)
    const catColWidth = (width - 120 - 16) / 2
    data.categories.forEach((cat, idx) => {
      const col = idx % 2
      const row = Math.floor(idx / 2)
      const px = 60 + col * (catColWidth + 16)
      const py = y + row * 52

      ctx.fillStyle = "rgba(30, 41, 59, 0.45)"
      roundRect(ctx, px, py, catColWidth, 42, 10)
      ctx.fill()
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)"
      ctx.lineWidth = 1
      roundRect(ctx, px, py, catColWidth, 42, 10)
      ctx.stroke()

      // Color indicator dot
      ctx.fillStyle = CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
      ctx.beginPath()
      ctx.arc(px + 18, py + 21, 5, 0, Math.PI * 2)
      ctx.fill()

      // Category Name
      ctx.fillStyle = "#F1F5F9"
      ctx.font = "600 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      ctx.fillText(`${cat.emoji} ${cat.label}`, px + 32, py + 26)

      // Amount & Percentage
      const amtStr = `${formatMinor(cat.totalMinor, opts.currency)} (${cat.percentage.toFixed(0)}%)`
      ctx.fillStyle = "#94A3B8"
      ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      const amtMetrics = ctx.measureText(amtStr)
      ctx.fillText(amtStr, px + catColWidth - amtMetrics.width - 16, py + 26)
    })

    y += Math.ceil(data.categories.length / 2) * 52 + 35
  }

  // 6. Settlement Transfers Section
  ctx.fillStyle = "#E2E8F0"
  ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  ctx.fillText("💰 SETTLEMENT PLAN (MINIMUM TRANSFERS)", 60, y)
  y += 22

  if (data.isSettled) {
    ctx.fillStyle = "rgba(16, 185, 129, 0.15)"
    roundRect(ctx, 60, y, width - 120, 80, 16)
    ctx.fill()
    ctx.strokeStyle = "rgba(52, 211, 153, 0.3)"
    ctx.lineWidth = 1.5
    roundRect(ctx, 60, y, width - 120, 80, 16)
    ctx.stroke()

    ctx.fillStyle = "#6EE7B7"
    ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    ctx.fillText("🎉 All Balances Settled Up!", 90, y + 48)
    y += 105
  } else {
    data.transfers.forEach((t) => {
      ctx.fillStyle = "rgba(30, 41, 59, 0.6)"
      roundRect(ctx, 60, y, width - 120, 54, 12)
      ctx.fill()
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)"
      ctx.lineWidth = 1
      roundRect(ctx, 60, y, width - 120, 54, 12)
      ctx.stroke()

      // Payer -> Payee
      ctx.fillStyle = "#F87171"
      ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      ctx.fillText(t.fromName, 80, y + 33)

      const fromW = ctx.measureText(t.fromName).width
      ctx.fillStyle = "#94A3B8"
      ctx.font = "500 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      ctx.fillText(" pays ", 80 + fromW, y + 33)

      const paysW = ctx.measureText(" pays ").width
      ctx.fillStyle = "#34D399"
      ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      ctx.fillText(t.toName, 80 + fromW + paysW, y + 33)

      // Amount
      const amtStr = formatMinor(t.amountMinor, opts.currency)
      ctx.fillStyle = "#FFFFFF"
      ctx.font = "bold 17px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
      const amtMetrics = ctx.measureText(amtStr)
      ctx.fillText(amtStr, width - 60 - amtMetrics.width - 24, y + 33)

      y += transferItemHeight
    })
    y += 20
  }

  // 7. Footer
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(60, height - 70)
  ctx.lineTo(width - 60, height - 70)
  ctx.stroke()

  ctx.fillStyle = "#64748B"
  ctx.font = "500 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  ctx.fillText("Generated with Hissaab · Fair splits & easy settlements", 60, height - 42)

  ctx.fillStyle = "#94A3B8"
  ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  const urlStr = "hissaab.app"
  const urlMetrics = ctx.measureText(urlStr)
  ctx.fillText(urlStr, width - 60 - urlMetrics.width, height - 42)

  return canvas
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

export function generateSummaryImageDataUrl(opts: SummaryCardOptions): string {
  const canvas = renderSummaryCardCanvas(opts)
  return canvas.toDataURL("image/png")
}

export async function generateSummaryImageBlob(opts: SummaryCardOptions): Promise<Blob | null> {
  const canvas = renderSummaryCardCanvas(opts)
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png")
  })
}

export function downloadSummaryImage(opts: SummaryCardOptions) {
  const dataUrl = generateSummaryImageDataUrl(opts)
  const a = document.createElement("a")
  const slug = opts.tripName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  a.href = dataUrl
  a.download = `hissaab-${slug}-summary.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export async function shareSummaryImageCard(
  opts: SummaryCardOptions,
  tripUrl: string
): Promise<"shared_image" | "downloaded_image" | "copied_text"> {
  const blob = await generateSummaryImageBlob(opts)

  if (blob && typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
    const slug = opts.tripName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const file = new File([blob], `hissaab-${slug}-summary.png`, { type: "image/png" })

    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: `${opts.tripName} — Settlement Summary`,
          text: `Trip summary for ${opts.tripName} on Hissaab: ${tripUrl}`,
          files: [file],
        })
        return "shared_image"
      } catch (err: any) {
        if (err.name === "AbortError") return "shared_image"
      }
    }
  }

  // Fallback on desktop: Download image
  downloadSummaryImage(opts)
  return "downloaded_image"
}
