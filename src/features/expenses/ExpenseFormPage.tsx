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
  const requestIdRef = useRef(crypto.randomUUID())
  const [splitMode, setSplitMode] = useState<"equal" | "exact" | "percent" | "shares">("equal")
  const [amountStr, setAmountStr] = useState("10.00")
  const [percentInputs, setPercentInputs] = useState<number[]>([])
  const [shareInputs, setShareInputs] = useState<number[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [payerInputs, setPayerInputs] = useState<{ userId: string; amountMinor: number }[]>([])
  const [localReceiptPreview, setLocalReceiptPreview] = useState<string | null>(null)
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false)

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
    setPayerInputs([{ userId: firstId, amountMinor: 1000 }])
    setPercentInputs(ids.map(() => 0))
    setShareInputs(ids.map(() => 1))
    const alloc = allocateEqual(1000, ids.length)
    setValue("payers", [{ userId: firstId, amountPaidMinor: 1000 }] as any)
    setValue("splits", ids.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })) as any)
  }, [membersLoading, members.length, expenseId])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<Form>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      tripId: tripId!,
      currency: baseCurrency,
      category: "food",
      expenseDate: new Date().toISOString().slice(0, 10),
      amountMinor: 1000,
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

  const dec = decimalsFor(baseCurrency)
  const watchedSplits = watch("splits") as any[] | undefined
  const amountMinor = parseCurrencyInput(amountStr, baseCurrency) ?? 0
  const totalPaid = payerInputs.reduce((s, p) => s + p.amountMinor, 0)
  const totalAllocatedMinor = (watchedSplits ?? []).reduce((s: number, v: any) => s + (Number(v.amountOwedMinor) || 0), 0)

  function syncSplitsToForm(next: { userId: string; amountOwedMinor: number }[]) {
    setValue("splits", next as any, { shouldValidate: true })
  }

  function equalize(ids = selectedIds) {
    const alloc = allocateEqual(amountMinor, ids.length)
    syncSplitsToForm(ids.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
  }

  function handlePercentChange(idx: number, val: number) {
    const next = [...percentInputs]
    next[idx] = val
    setPercentInputs(next)
    const alloc = allocatePercent(amountMinor, next)
    if (alloc) syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
  }

  function handleSharesChange(idx: number, val: number) {
    const next = [...shareInputs]
    next[idx] = val
    setShareInputs(next)
    const alloc = allocateShares(amountMinor, next)
    if (alloc) syncSplitsToForm(selectedIds.map((id, i) => ({ userId: id, amountOwedMinor: alloc[i] })))
  }

  function toggleParticipant(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    setSelectedIds(next)
    setPercentInputs(next.map(() => 0))
    setShareInputs(next.map(() => 1))
    equalize(next)
  }

  function selectAllMembers() {
    const allIds = members.map((m: any) => m.id)
    setSelectedIds(allIds)
    setPercentInputs(allIds.map(() => 0))
    setShareInputs(allIds.map(() => 1))
    equalize(allIds)
  }

  function clearSelectedMembers() {
    setSelectedIds([])
    syncSplitsToForm([])
  }

  // init percent/shares when amount changes in equal mode
  useEffect(() => {
    if (splitMode === "equal" && selectedIds.length) equalize()
  }, [amountMinor, selectedIds.length])

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
      navigate(`/trips/${tripId}/expenses`)
    } catch (e: any) {
      const msg = String(e.message ?? "")
      if (msg.includes("CONFLICT stale_expense") || msg.includes("CONFLICT")) {
        setErr("Someone else updated this expense while you were editing. Your changes were kept — please refresh the latest values and save again.")
        return
      }
      setErr(msg)
    }
  }

  if (expenseId && existingLoading) return <div className="mx-auto max-w-lg h-40 animate-pulse rounded-xl bg-hair/40" aria-label="Loading expense" />

  const perPersonAmount = selectedIds.length > 0 ? Math.round(amountMinor / selectedIds.length) : 0

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link
        to={`/trips/${tripId}/expenses`}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft hover:text-ink transition-colors"
      >
        ← Back to expenses
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
      {isArchived && <p role="alert" className="rounded-xl border border-slate-700/60 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Archived — read-only. No edits allowed.</p>}

      <label htmlFor="exp-desc" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">Description
        <input id="exp-desc" {...register("description")} className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none" placeholder="e.g. Beach dinner" aria-invalid={!!errors.description} />
        {errors.description && <span className="mt-1 block text-xs text-owe" role="alert">{errors.description.message}</span>}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label htmlFor="exp-amount" className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">Amount ({baseCurrency})
          <input id="exp-amount" value={amountStr} onChange={(e) => { setAmountStr(e.target.value); const minor = parseCurrencyInput(e.target.value, baseCurrency); if (minor !== null) setValue("amountMinor", minor as any, { shouldValidate: true }) }} placeholder={dec === 0 ? "1200" : "1250.50"} className="mt-1 w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-3 text-base font-semibold tabular-nums focus:border-brand focus:ring-1 focus:ring-brand outline-none" aria-describedby="exp-amount-hint" inputMode="decimal" />
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
                next[i] = { ...next[i], userId: e.target.value }
                setPayerInputs(next)
                setValue("payers", next.map((x) => ({ userId: x.userId, amountPaidMinor: x.amountMinor })) as any)
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
                setValue("payers", next.map((x) => ({ userId: x.userId, amountPaidMinor: x.amountMinor })) as any)
              }}
              className="w-32 min-h-11 rounded-lg border border-hair bg-surface px-3 text-sm font-semibold tabular-nums"
              aria-label={`Payer amount for ${members.find((m: any) => m.id === p.userId)?.name ?? p.userId}`}
            />
            {payerInputs.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  const next = payerInputs.filter((_, idx) => idx !== i)
                  setPayerInputs(next.length ? next : [{ userId: members[0].id, amountMinor: amountMinor }])
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
        {errors.payers && <p className="text-xs text-owe" role="alert">{(errors.payers as any).message}</p>}
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
                onClick={() => {
                  setSplitMode(m)
                  if (m === "equal") equalize()
                  if (m === "percent") setPercentInputs(selectedIds.map(() => 0))
                  if (m === "shares") setShareInputs(selectedIds.map(() => 1))
                }}
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
            <div className="flex gap-2">
              <button type="button" onClick={selectAllMembers} className="font-semibold text-brand hover:underline">Select all</button>
              <span>·</span>
              <button type="button" onClick={clearSelectedMembers} className="font-semibold text-ink-faint hover:underline">Clear</button>
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
        {errors.splits && <p className="text-xs text-owe" role="alert">{(errors.splits as any).message}</p>}
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
      
      <button
        disabled={isSubmitting || isArchived || existingLoading}
        aria-disabled={isArchived}
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {isSubmitting ? "Saving…" : expenseId ? "Save changes" : "Save expense"}
      </button>
    </form>
    </div>
  )
}
