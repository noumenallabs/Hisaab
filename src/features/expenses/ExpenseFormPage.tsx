import { useParams, useNavigate, Link } from "react-router"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { expenseSchema } from "./schemas"
import { z } from "zod"
import { useSaveExpense, useExpense } from "./hooks"
import { getSupabase } from "@/lib/supabase"
import { useTripMembers } from "@/features/trips/useMembers"
import { useTrip } from "@/features/trips/hooks"
import { useState, useRef, useEffect } from "react"
import { allocateEqual, allocatePercent, allocateShares, money } from "./money"
import { parseCurrencyInput, fromMinor, decimalsFor, formatMinor } from "@/lib/currency"
import { uploadReceipt, validateReceiptFile } from "@/lib/receipts"
import { FormSkeleton } from "@/components/feedback/Skeleton"
import { useToast } from "@/components/feedback/ToastProvider"
import { ArrowLeft } from "lucide-react"

type Form = z.infer<typeof expenseSchema>

const CATEGORIES: { id: "food" | "transport" | "accommodation" | "tickets" | "shopping" | "other"; label: string; icon: string }[] = [
  { id: "food", label: "Food", icon: "🍕" },
  { id: "transport", label: "Transport", icon: "🚕" },
  { id: "accommodation", label: "Stay", icon: "🏨" },
  { id: "tickets", label: "Tickets", icon: "🎟️" },
  { id: "shopping", label: "Shopping", icon: "🛍️" },
  { id: "other", label: "Other", icon: "📦" },
]

export function ExpenseFormPage() {
  const { tripId, expenseId } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const save = useSaveExpense(tripId!)
  const { data: tripMembers } = useTripMembers(tripId!)
  const { data: trip } = useTrip(tripId!)
  const { data: existing, isLoading: existingLoading } = useExpense(tripId!, expenseId ?? "")
  const [err, setErr] = useState<string | null>(null)
  const supabase = getSupabase()
  const members: any[] = (tripMembers ?? []).map((m) => ({ id: m.user_id, name: m.name, email: m.email }))
  const membersLoading = !tripMembers
  const isArchived = trip?.status === "archived"
  const baseCurrency = (trip as any)?.base_currency ?? "INR"
  const dec = decimalsFor(baseCurrency)
  const defaultAmountStr = dec === 0 ? "10" : "10.00"
  const defaultAmountMinor = parseCurrencyInput(defaultAmountStr, baseCurrency) ?? (dec === 0 ? 10 : 1000)
  const requestIdRef = useRef(crypto.randomUUID())
  const shouldAddAnotherRef = useRef(false)
  const draftKey = `tripsplit:draft:${tripId}`
  const [splitMode, setSplitMode] = useState<"equal" | "exact" | "percent" | "shares">("equal")
  const [amountStr, setAmountStr] = useState(defaultAmountStr)
  const [percentInputs, setPercentInputs] = useState<number[]>([])
  const [shareInputs, setShareInputs] = useState<number[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [payerInputs, setPayerInputs] = useState<{ userId: string; amountMinor: number }[]>([])
  const [localReceiptPreview, setLocalReceiptPreview] = useState<string | null>(null)
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false)
  const [justReset, setJustReset] = useState(false)

  // initialize once when members load (avoids demo fallback leaking into real trip)
  const initializedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current) return
    if (membersLoading) return
    if (!members.length) return
    if (expenseId) return // edit mode hydrates separately
    initializedRef.current = true
    const ids = members.map((m: any) => m.id)
    setSelectedIds(ids)
    const firstId = members[0]?.id

    let restoredDraft: any = null
    try {
      const rawDraft = localStorage.getItem(draftKey)
      if (rawDraft) restoredDraft = JSON.parse(rawDraft)
    } catch {}

    const curDec = decimalsFor(baseCurrency)
    const fallbackAmount = curDec === 0 ? "10" : "10.00"
    const initAmount = restoredDraft?.amountStr || fallbackAmount
    const initMinor = parseCurrencyInput(initAmount, baseCurrency) ?? (curDec === 0 ? 10 : 1000)
    setAmountStr(initAmount)
    setPayerInputs([{ userId: firstId, amountMinor: initMinor }])
    setPercentInputs(ids.map(() => 0))
    setShareInputs(ids.map(() => 1))
    const alloc = allocateEqual(initMinor, ids.length)
    setValue("amountMinor", initMinor as any)
    setValue("payers", [{ userId: firstId, amountPaidMinor: initMinor }] as any)
    setValue("splits", ids.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })) as any)

    if (restoredDraft) {
      if (restoredDraft.description) setValue("description", restoredDraft.description)
      if (restoredDraft.category) setValue("category", restoredDraft.category)
      if (restoredDraft.notes) setValue("notes", restoredDraft.notes)
      if (restoredDraft.expenseDate) setValue("expenseDate", restoredDraft.expenseDate)
    }
  }, [membersLoading, members.length, expenseId, draftKey, baseCurrency])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    clearErrors,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Form>({
    mode: "onChange",
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      tripId: tripId!,
      currency: baseCurrency,
      category: "food",
      expenseDate: new Date().toISOString().slice(0, 10),
      amountMinor: defaultAmountMinor,
      payers: payerInputs.map((p) => ({ userId: p.userId, amountPaidMinor: p.amountMinor })),
      splits: selectedIds.map((id) => ({ userId: id, amountOwedMinor: 500 })),
      requestId: requestIdRef.current,
    } as any,
  })

  const currentCategory = watch("category")

  // hydrate edit
  useEffect(() => {
    if (!expenseId || !existing) return
    const amt = (existing as any).amount_minor ?? 1000
    const dec = baseCurrency === "JPY" ? 0 : 2
    setAmountStr((amt / Math.pow(10, dec)).toFixed(dec))
    const payers = ((existing as any).expense_payers ?? []).map((p: any) => ({ userId: p.user_id, amountPaidMinor: p.amount_paid_minor }))
    const splits = ((existing as any).expense_splits ?? []).map((s: any) => ({ userId: s.user_id, amountOwedMinor: s.amount_owed_minor }))
    setSelectedIds(splits.map((s: any) => s.userId))
    setPayerInputs(payers.length ? payers.map((p: any) => ({ userId: p.userId, amountMinor: p.amountPaidMinor })) : payerInputs)
    reset({
      description: (existing as any).description,
      amountMinor: amt,
      currency: (existing as any).currency ?? baseCurrency,
      category: (existing as any).category ?? "food",
      expenseDate: (existing as any).expense_date ?? new Date().toISOString().slice(0, 10),
      notes: (existing as any).notes ?? "",
      receiptPath: (existing as any).receipt_path ?? null,
      payers: payers.length ? payers : [{ userId: members[0]?.id, amountPaidMinor: amt }],
      splits,
      requestId: requestIdRef.current,
      tripId: tripId!,
      expenseId,
      expectedUpdatedAt: (existing as any).updated_at ?? null,
    } as any)
  }, [existing, expenseId])

  // keep currency in sync with trip
  useEffect(() => {
    if (baseCurrency) setValue("currency", baseCurrency as any)
  }, [baseCurrency])

  // warn on leave when dirty — spec §7.6
  useEffect(() => {
    if (!isDirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", h)
    return () => window.removeEventListener("beforeunload", h)
  }, [isDirty])

  const watchedSplits = watch("splits") as any[] | undefined
  const amountMinor = parseCurrencyInput(amountStr, baseCurrency) ?? 0
  const totalPaid = payerInputs.reduce((s, p) => s + p.amountMinor, 0)
  const totalAllocatedMinor = (watchedSplits ?? []).reduce((s: number, v: any) => s + (Number(v.amountOwedMinor) || 0), 0)

  function syncSplitsToForm(next: { userId: string; amountOwedMinor: number }[]) {
    setValue("splits", next as any, { shouldDirty: true, shouldValidate: true })
    const newTotal = next.reduce((s, v) => s + (Number(v.amountOwedMinor) || 0), 0)
    if (newTotal === amountMinor) {
      clearErrors("splits")
    }
  }

  function equalize(ids = selectedIds) {
    const alloc = allocateEqual(amountMinor, ids.length)
    syncSplitsToForm(ids.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] ?? 0 })))
  }

  function switchSplitMode(nextMode: "equal" | "exact" | "percent" | "shares") {
    setSplitMode(nextMode)
    if (nextMode === "equal") {
      equalize(selectedIds)
    } else if (nextMode === "exact") {
      const alloc = allocateEqual(amountMinor, selectedIds.length)
      const nextSplits = selectedIds.map((id, i) => ({
        userId: id,
        amountOwedMinor: alloc[i] ?? 0,
      }))
      syncSplitsToForm(nextSplits)
    } else if (nextMode === "percent") {
      let nextPercents = [...percentInputs]
      const sum = nextPercents.reduce((a, b) => a + b, 0)
      if (nextPercents.length !== selectedIds.length || Math.abs(sum - 100) > 0.001) {
        if (selectedIds.length > 0) {
          const basePct = Math.floor(100 / selectedIds.length)
          const remPct = 100 - basePct * selectedIds.length
          nextPercents = selectedIds.map((_, i) => basePct + (i < remPct ? 1 : 0))
        } else {
          nextPercents = []
        }
        setPercentInputs(nextPercents)
      }
      const alloc = allocatePercent(amountMinor, nextPercents)
      if (alloc) {
        syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
      }
    } else if (nextMode === "shares") {
      let nextShares = [...shareInputs]
      if (nextShares.length !== selectedIds.length || nextShares.some((s) => s <= 0)) {
        nextShares = selectedIds.map(() => 1)
        setShareInputs(nextShares)
      }
      const alloc = allocateShares(amountMinor, nextShares)
      if (alloc) {
        syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
      }
    }
  }

  function handlePercentChange(idx: number, val: number) {
    const next = [...percentInputs]
    next[idx] = val
    setPercentInputs(next)
    const alloc = allocatePercent(amountMinor, next)
    if (alloc) {
      syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
    } else {
      const raw = next.map((p) => Math.round((amountMinor * (p || 0)) / 100))
      syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: raw[i] })))
    }
  }

  function handleSharesChange(idx: number, val: number) {
    const next = [...shareInputs]
    next[idx] = val
    setShareInputs(next)
    const alloc = allocateShares(amountMinor, next)
    if (alloc) {
      syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
    } else {
      syncSplitsToForm(selectedIds.map((id) => ({ userId: id, amountOwedMinor: 0 })))
    }
  }

  function applyParticipantSelection(nextIds: string[]) {
    setSelectedIds(nextIds)
    if (nextIds.length === 0) {
      setPercentInputs([])
      setShareInputs([])
      syncSplitsToForm([])
      return
    }

    if (splitMode === "equal") {
      setPercentInputs(nextIds.map(() => 0))
      setShareInputs(nextIds.map(() => 1))
      equalize(nextIds)
    } else if (splitMode === "shares") {
      const nextShares = nextIds.map((id) => {
        const prevIdx = selectedIds.indexOf(id)
        return prevIdx !== -1 && shareInputs[prevIdx] !== undefined ? shareInputs[prevIdx] : 1
      })
      setShareInputs(nextShares)
      const alloc = allocateShares(amountMinor, nextShares)
      if (alloc) {
        syncSplitsToForm(nextIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
      }
    } else if (splitMode === "percent") {
      const nextPercents = nextIds.map((id) => {
        const prevIdx = selectedIds.indexOf(id)
        return prevIdx !== -1 && percentInputs[prevIdx] !== undefined ? percentInputs[prevIdx] : 0
      })
      setPercentInputs(nextPercents)
      const alloc = allocatePercent(amountMinor, nextPercents)
      if (alloc) {
        syncSplitsToForm(nextIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
      }
    } else if (splitMode === "exact") {
      const curSplits = (watch("splits") as any[]) ?? []
      const nextSplits = nextIds.map((id) => {
        const existingSplit = curSplits.find((s) => s.userId === id)
        return {
          userId: id,
          amountOwedMinor: existingSplit?.amountOwedMinor ?? 0,
        }
      })
      syncSplitsToForm(nextSplits)
    }
  }

  function toggleParticipant(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    applyParticipantSelection(next)
  }

  function selectAllMembers() {
    const allIds = members.map((m: any) => m.id)
    applyParticipantSelection(allIds)
  }

  function clearSelectedMembers() {
    applyParticipantSelection([])
  }

  function invertSelectedMembers() {
    const allIds = members.map((m: any) => m.id)
    const inverted = allIds.filter((id: string) => !selectedIds.includes(id))
    applyParticipantSelection(inverted)
  }

  // init percent/shares when amount changes in equal mode
  useEffect(() => {
    if (splitMode === "equal" && selectedIds.length) equalize()
  }, [amountMinor, selectedIds.length, splitMode])

  // sync single payer amount with total amount
  useEffect(() => {
    if (payerInputs.length === 1 && payerInputs[0].amountMinor !== amountMinor) {
      const next = [{ userId: payerInputs[0].userId, amountMinor }]
      setPayerInputs(next)
      setValue("payers", next.map((x) => ({ userId: x.userId, amountPaidMinor: x.amountMinor })) as any, { shouldValidate: true })
    }
  }, [amountMinor, payerInputs.length])

  // clear payer and split errors when totals match exactly
  useEffect(() => {
    if (totalPaid === amountMinor && errors.payers) {
      clearErrors("payers")
    }
  }, [totalPaid, amountMinor, errors.payers, clearErrors])

  useEffect(() => {
    if (totalAllocatedMinor === amountMinor && errors.splits) {
      clearErrors("splits")
    }
  }, [totalAllocatedMinor, amountMinor, errors.splits, clearErrors])

  // auto-save draft on input change
  const currentDesc = watch("description")
  const currentNotes = watch("notes")
  const currentDate = watch("expenseDate")
  useEffect(() => {
    if (expenseId) return
    const curDec = decimalsFor(baseCurrency)
    const defaultAmount = curDec === 0 ? "10" : "10.00"
    if (!currentDesc && !currentNotes && amountStr === defaultAmount) return
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({
          description: currentDesc,
          notes: currentNotes,
          category: currentCategory,
          expenseDate: currentDate,
          amountStr,
        })
      )
    } catch {}
  }, [currentDesc, currentNotes, currentCategory, currentDate, amountStr, expenseId, draftKey, baseCurrency])

  async function onSubmit(v: Form) {
    try {
      if (isArchived) throw new Error("Archived trips are read-only.")
      if (!getSupabase()) {
        navigate(`/trips/${tripId}/expenses`)
        return
      }
      if (splitMode === "percent" && Math.abs(percentInputs.reduce((a, b) => a + b, 0) - 100) > 0.001) throw new Error("Percent total must equal 100%")
      if (splitMode === "shares" && shareInputs.reduce((a, b) => a + b, 0) <= 0) throw new Error("Shares must have at least one positive")
      await save.mutateAsync({
        ...v,
        tripId: tripId!,
        expenseId,
        amountMinor,
        currency: v.currency.toUpperCase(),
        payers: payerInputs.map((p) => ({ userId: p.userId, amountPaidMinor: p.amountMinor })),
        splits: (watch("splits") as any) ?? [],
        requestId: requestIdRef.current,
      } as any)

      try {
        localStorage.removeItem(draftKey)
      } catch {}

      if (shouldAddAnotherRef.current) {
        requestIdRef.current = crypto.randomUUID()
        toast(`Saved "${v.description}"! Ready for next expense.`, "success")
        setValue("description", "" as any, { shouldDirty: false })
        setValue("notes", "" as any, { shouldDirty: false })
        setValue("receiptPath", null as any, { shouldDirty: false })
        setLocalReceiptPreview(null)
        const curDec = decimalsFor(baseCurrency)
        const resetAmountStr = curDec === 0 ? "10" : "10.00"
        const resetAmountMinor = parseCurrencyInput(resetAmountStr, baseCurrency) ?? (curDec === 0 ? 10 : 1000)
        setAmountStr(resetAmountStr)
        setValue("amountMinor", resetAmountMinor as any)
        if (payerInputs.length === 1) {
          setPayerInputs([{ userId: payerInputs[0].userId, amountMinor: resetAmountMinor }])
          setValue("payers", [{ userId: payerInputs[0].userId, amountPaidMinor: resetAmountMinor }] as any)
        }
        if (splitMode === "equal") {
          equalize()
        }
        shouldAddAnotherRef.current = false
        setJustReset(true)
        setTimeout(() => setJustReset(false), 1400)
        setTimeout(() => {
          document.getElementById("exp-desc")?.focus()
        }, 50)
      } else {
        navigate(`/trips/${tripId}/expenses`)
      }
    } catch (e: any) {
      const msg = String(e.message ?? "")
      if (msg.includes("CONFLICT stale_expense") || msg.includes("CONFLICT")) {
        setErr("Someone else updated this expense while you were editing. Your changes were kept — please refresh the latest values and save again.")
        return
      }
      setErr(msg)
    }
  }

  if (expenseId && existingLoading) return <FormSkeleton />

  const perPersonAmount = selectedIds.length > 0 ? Math.round(amountMinor / selectedIds.length) : 0

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link
        to={`/trips/${tripId}/expenses`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
      >
        <ArrowLeft size={14} /> Back to expenses
      </Link>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 rounded-2xl border border-hair bg-surface p-6 shadow-sm" aria-labelledby="expense-form-title">
        <div className="flex items-center justify-between border-b border-hair pb-4">
          <div>
            <h1 id="expense-form-title" className="text-xl font-bold tracking-tight">{expenseId ? "Edit expense" : "Add expense"}</h1>
            <p className="text-xs text-ink-soft">Enter details to split costs with your group</p>
          </div>
          <Link to={`/trips/${tripId}/expenses`} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-canvas">Cancel</Link>
        </div>

      {isDirty && <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Unsaved changes — you will be warned on leave.</p>}
      {isArchived && <p role="alert" className="rounded-xl border border-hair bg-canvas/80 px-4 py-2.5 text-sm font-semibold text-ink-soft">Archived — read-only. No edits allowed.</p>}

      <label htmlFor="exp-desc" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">Description
        <input
          id="exp-desc"
          {...register("description")}
          className={`mt-1 w-full min-h-11 rounded-xl border bg-surface px-3 py-3 text-sm outline-none transition-all duration-300 ${
            justReset
              ? "border-emerald-500 ring-2 ring-emerald-500/30 bg-emerald-50/20 dark:bg-emerald-950/20"
              : "border-hair focus:border-brand focus:ring-1 focus:ring-brand"
          }`}
          placeholder="e.g. Beach dinner"
          aria-invalid={!!errors.description}
        />
        {errors.description && <span className="mt-1 block text-xs text-owe" role="alert">{errors.description.message}</span>}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label htmlFor="exp-amount" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">Amount ({baseCurrency})
          <input
            id="exp-amount"
            value={amountStr}
            onChange={(e) => {
              const newStr = e.target.value
              setAmountStr(newStr)
              const minor = parseCurrencyInput(newStr, baseCurrency)
              if (minor !== null) {
                setValue("amountMinor", minor as any, { shouldValidate: true, shouldDirty: true })
                if (payerInputs.length === 1) {
                  const nextPayers = [{ userId: payerInputs[0].userId, amountMinor: minor }]
                  setPayerInputs(nextPayers)
                  setValue("payers", nextPayers.map((x) => ({ userId: x.userId, amountPaidMinor: x.amountMinor })) as any, { shouldValidate: true, shouldDirty: true })
                  clearErrors("payers")
                }
                if (splitMode === "equal") {
                  const alloc = allocateEqual(minor, selectedIds.length)
                  syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] ?? 0 })))
                } else if (splitMode === "percent") {
                  const alloc = allocatePercent(minor, percentInputs)
                  if (alloc) {
                    syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
                  } else {
                    const raw = percentInputs.map((p) => Math.round((minor * (p || 0)) / 100))
                    syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: raw[i] })))
                  }
                } else if (splitMode === "shares") {
                  const alloc = allocateShares(minor, shareInputs)
                  if (alloc) {
                    syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
                  } else {
                    syncSplitsToForm(selectedIds.map((id) => ({ userId: id, amountOwedMinor: 0 })))
                  }
                }
              }
            }}
            placeholder={dec === 0 ? "1200" : "1250.50"}
            className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-3 text-base font-semibold tabular-nums focus:border-brand focus:ring-1 focus:ring-brand outline-none"
            aria-describedby="exp-amount-hint"
            inputMode="decimal"
          />
          <span id="exp-amount-hint" className="mt-1 block text-[11px] font-normal text-ink-faint">Preview: {formatMinor(amountMinor, baseCurrency)}</span>
          {errors.amountMinor && <span className="text-xs text-owe" role="alert">{errors.amountMinor.message}</span>}
        </label>
        <input type="hidden" {...register("amountMinor", { valueAsNumber: true })} />
        <label htmlFor="exp-date" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">Expense Date
          <input id="exp-date" type="date" {...register("expenseDate")} className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none" />
        </label>
        <input id="exp-currency" {...register("currency")} readOnly className="sr-only" aria-hidden="true" tabIndex={-1} />
      </div>

      {/* Visual Category Selector */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink-soft mb-2">Category</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {CATEGORIES.map((cat) => {
            const isSelected = currentCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setValue("category", cat.id as any, { shouldDirty: true })}
                className={`flex flex-col items-center justify-center rounded-xl border p-2.5 text-xs transition-all ${
                  isSelected
                    ? "border-brand bg-brand/10 text-brand font-bold shadow-xs"
                    : "border-hair bg-surface text-ink-soft hover:bg-canvas"
                }`}
              >
                <span className="text-lg">{cat.icon}</span>
                <span className="mt-1">{cat.label}</span>
              </button>
            )
          })}
        </div>
        <input type="hidden" {...register("category")} />
      </div>

      {/* Payers Section */}
      <div className="rounded-xl border border-hair bg-canvas/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Paid By</span>
          <span className="text-xs font-medium text-ink-soft">
            Total {formatMinor(totalPaid, baseCurrency)} / {formatMinor(amountMinor, baseCurrency)}{" "}
            {totalPaid === amountMinor ? <span className="text-emerald-600 font-bold">✓</span> : <span className="text-owe font-semibold">({formatMinor(amountMinor - totalPaid, baseCurrency)} left)</span>}
          </span>
        </div>
        {payerInputs.map((p, i) => (
          <div key={p.userId} className="flex gap-2 items-center">
            <select
              value={p.userId}
              onChange={(e) => {
                const next = [...payerInputs]
                const newUserId = e.target.value
                next[i] = {
                  userId: newUserId,
                  amountMinor: payerInputs.length === 1 ? amountMinor : next[i].amountMinor,
                }
                setPayerInputs(next)
                setValue("payers", next.map((x) => ({ userId: x.userId, amountPaidMinor: x.amountMinor })) as any, { shouldValidate: true })
              }}
              className="flex-1 min-h-11 rounded-lg border border-hair bg-surface px-3 text-sm font-medium"
            >
              {members.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              value={p.amountMinor === 0 ? "" : String(fromMinor(p.amountMinor, dec))}
              placeholder={dec === 0 ? "0" : "0.00"}
              onChange={(e) => {
                const minor = parseCurrencyInput(e.target.value, baseCurrency)
                const next = [...payerInputs]
                next[i] = { ...next[i], amountMinor: minor ?? 0 }
                setPayerInputs(next)
                const nextPayers = next.map((x) => ({ userId: x.userId, amountPaidMinor: x.amountMinor }))
                setValue("payers", nextPayers as any, { shouldDirty: true })
                const newTotalPaid = next.reduce((s, p) => s + p.amountMinor, 0)
                if (newTotalPaid === amountMinor) {
                  clearErrors("payers")
                }
              }}
              className="w-32 min-h-11 rounded-lg border border-hair bg-surface px-3 text-sm font-semibold tabular-nums"
              aria-label={`Payer amount for ${members.find((m: any) => m.id === p.userId)?.name ?? p.userId}`}
            />
            {payerInputs.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const next = payerInputs.filter((_, idx) => idx !== i)
                  const updated = next.length ? next : [{ userId: members[0].id, amountMinor: amountMinor }]
                  setPayerInputs(updated)
                  setValue("payers", updated.map((x) => ({ userId: x.userId, amountPaidMinor: x.amountMinor })) as any, { shouldDirty: true })
                  if (updated.reduce((s, p) => s + p.amountMinor, 0) === amountMinor) {
                    clearErrors("payers")
                  }
                }}
                className="min-h-11 w-8 text-ink-faint hover:text-owe font-bold"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPayerInputs([...payerInputs, { userId: members[0].id, amountMinor: 0 }])}
          className="text-xs font-bold text-brand hover:underline"
        >
          + Add multiple payers
        </button>
        {errors.payers && totalPaid !== amountMinor && (
          <p className="text-xs text-owe" role="alert">
            {(errors.payers as any).message ?? "Payer sum must equal total"}
          </p>
        )}
      </div>

      {/* Split Section */}
      <div className="rounded-xl border border-hair bg-canvas/40 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Split Between</span>
            {splitMode === "equal" && selectedIds.length > 0 && (
              <span className="ml-2 inline-block rounded bg-brand/10 px-2 py-0.5 text-[11px] font-bold text-brand">
                {formatMinor(perPersonAmount, baseCurrency)} / person
              </span>
            )}
          </div>
          <div className="flex gap-1" role="group" aria-label="Split mode">
            {(["equal", "exact", "percent", "shares"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchSplitMode(m)}
                className={`min-h-8 rounded-lg px-2.5 text-xs font-semibold capitalize transition-colors ${
                  splitMode === m ? "bg-brand text-white" : "bg-surface text-ink-soft hover:bg-hair"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Member Chips Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-ink-soft">
            <span>Participants ({selectedIds.length} of {members.length})</span>
            <div className="flex items-center gap-1.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={selectAllMembers}
                className="rounded-md border border-hair bg-surface px-2 py-0.5 text-brand shadow-2xs hover:bg-canvas transition-colors"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={invertSelectedMembers}
                className="rounded-md border border-hair bg-surface px-2 py-0.5 text-ink-soft shadow-2xs hover:bg-canvas transition-colors"
              >
                Invert
              </button>
              <button
                type="button"
                onClick={clearSelectedMembers}
                className="rounded-md border border-hair bg-surface px-2 py-0.5 text-ink-faint shadow-2xs hover:bg-canvas transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m: any) => {
              const isSelected = selectedIds.includes(m.id)
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleParticipant(m.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    isSelected
                      ? "border-brand bg-brand text-white shadow-xs"
                      : "border-hair bg-surface text-ink-soft hover:bg-hair"
                  }`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                    isSelected ? "bg-white text-brand" : "bg-hair text-ink"
                  }`}>
                    {(m.name ?? "?")[0].toUpperCase()}
                  </span>
                  <span>{m.name}</span>
                  <span className="text-[10px]">{isSelected ? "✓" : "+"}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Custom Split Inputs */}
        {splitMode !== "equal" && (
          <div className="space-y-2 border-t border-hair pt-3">
            {selectedIds.map((id, i) => (
              <div key={id} className="flex gap-2 items-center">
                <label htmlFor={`split-${i}`} className="w-28 text-xs font-semibold truncate">
                  {members.find((m: any) => m.id === id)?.name ?? id.slice(0, 8)}
                </label>
                {splitMode === "exact" && (
                  <input
                    id={`split-${i}`}
                    type="text"
                    inputMode="decimal"
                    value={
                      (watchedSplits as any)?.[i]?.amountOwedMinor === undefined || (watchedSplits as any)?.[i]?.amountOwedMinor === 0
                        ? ""
                        : String(fromMinor((watchedSplits as any)?.[i]?.amountOwedMinor ?? 0, dec))
                    }
                    onChange={(e) => {
                      const minor = parseCurrencyInput(e.target.value, baseCurrency)
                      const cur = (watch("splits") as any) ?? []
                      const next = [...cur]
                      next[i] = { ...next[i], userId: id, amountOwedMinor: minor ?? 0 }
                      syncSplitsToForm(next)
                    }}
                    className="flex-1 min-h-10 rounded-lg border border-hair bg-surface px-3 text-sm tabular-nums outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                    placeholder={dec === 0 ? "0" : "0.00"}
                  />
                )}
                {splitMode === "percent" && (
                  <div className="flex flex-1 items-center gap-1">
                    <input
                      id={`split-${i}`}
                      type="number"
                      value={percentInputs[i] ?? 0}
                      onChange={(e) => handlePercentChange(i, Number(e.target.value))}
                      className="flex-1 min-h-10 rounded-lg border border-hair bg-surface px-3 text-sm"
                      placeholder="%"
                    />
                    <span className="text-xs text-ink-soft">%</span>
                  </div>
                )}
                {splitMode === "shares" && (
                  <div className="flex flex-1 items-center gap-1">
                    <input
                      id={`split-${i}`}
                      type="number"
                      value={shareInputs[i] ?? 1}
                      onChange={(e) => handleSharesChange(i, Number(e.target.value))}
                      className="flex-1 min-h-10 rounded-lg border border-hair bg-surface px-3 text-sm"
                      placeholder="shares"
                    />
                    <span className="text-xs text-ink-soft">share(s)</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-ink-faint">
          Allocated {formatMinor(totalAllocatedMinor, baseCurrency)} / {formatMinor(amountMinor, baseCurrency)}{" "}
          {totalAllocatedMinor === amountMinor ? (
            <span className="text-emerald-600 font-bold">✓</span>
          ) : (
            <span className="text-owe font-semibold">({formatMinor(amountMinor - totalAllocatedMinor, baseCurrency)} remaining)</span>
          )}
        </p>
        {errors.splits && totalAllocatedMinor !== amountMinor && (
          <p className="text-xs text-owe" role="alert">
            {(errors.splits as any).message ?? "Split sum must equal total"}
          </p>
        )}
      </div>

      {/* Receipt Upload & Preview */}
      <div className="rounded-xl border border-hair bg-canvas/40 p-4 space-y-2">
        <label htmlFor="exp-receipt-file" className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Receipt Attachment
        </label>
        <input
          id="exp-receipt-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              validateReceiptFile(f)
              if (f.type.startsWith("image/")) {
                if (localReceiptPreview) URL.revokeObjectURL(localReceiptPreview)
                setLocalReceiptPreview(URL.createObjectURL(f))
              }
              setIsUploadingReceipt(true)
              const expId = expenseId ?? crypto.randomUUID()
              const path = await uploadReceipt(tripId!, expId, f)
              setValue("receiptPath", path as any, { shouldDirty: true })
              setErr(null)
            } catch (err: any) {
              setErr(err.message)
            } finally {
              setIsUploadingReceipt(false)
            }
          }}
          className="block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
        />
        <input type="hidden" {...register("receiptPath")} />
        {localReceiptPreview && (
          <div className="relative mt-2 inline-block">
            <img src={localReceiptPreview} alt="Receipt preview" className="h-20 w-20 rounded-lg object-cover border border-hair" />
            <button
              type="button"
              onClick={() => {
                if (localReceiptPreview) URL.revokeObjectURL(localReceiptPreview)
                setLocalReceiptPreview(null)
                setValue("receiptPath", null as any, { shouldDirty: true })
              }}
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-owe text-white text-xs font-bold"
            >
              ×
            </button>
          </div>
        )}
        {watch("receiptPath") && !localReceiptPreview && (
          <p className="text-xs text-ink-soft">
            Attached: {String(watch("receiptPath")).slice(0, 40)}…{" "}
            <button type="button" onClick={() => setValue("receiptPath", null as any)} className="font-semibold text-owe hover:underline">
              Remove
            </button>
          </p>
        )}
        {isUploadingReceipt && <p className="text-xs text-brand animate-pulse">Uploading receipt…</p>}
      </div>

      {/* Notes */}
      <label htmlFor="exp-notes" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">Notes
        <textarea id="exp-notes" {...register("notes")} className="mt-1 w-full rounded-xl border border-hair bg-surface px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none" rows={2} maxLength={2000} placeholder="Additional details or reference notes" />
        <span className="mt-1 block text-right text-[11px] text-ink-faint">{(watch("notes") as any ?? "").length}/2000</span>
      </label>

      {err && <p className="text-sm font-semibold text-owe" role="alert">{err}</p>}
      
      <div className="flex flex-col sm:flex-row gap-2.5">
        <button
          type="submit"
          onClick={() => {
            shouldAddAnotherRef.current = false
          }}
          disabled={isSubmitting || isArchived || existingLoading}
          aria-disabled={isArchived}
          className="flex-1 flex min-h-12 items-center justify-center rounded-xl bg-brand text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isSubmitting && !shouldAddAnotherRef.current
            ? "Saving…"
            : expenseId
            ? "Save changes"
            : "Save expense"}
        </button>
        {!expenseId && (
          <button
            type="submit"
            onClick={() => {
              shouldAddAnotherRef.current = true
            }}
            disabled={isSubmitting || isArchived || existingLoading}
            aria-disabled={isArchived}
            className="flex-1 flex min-h-12 items-center justify-center rounded-xl border border-hair bg-surface text-sm font-bold text-ink shadow-2xs hover:bg-canvas disabled:opacity-50 transition-colors"
          >
            {isSubmitting && shouldAddAnotherRef.current
              ? "Saving…"
              : "+ Save & add another"}
          </button>
        )}
      </div>
    </form>
    </div>
  )
}
