import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { tripSchema } from "./schemas"
import { z } from "zod"
import { Link, useNavigate } from "react-router"
import { useCreateTrip } from "./hooks"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useState } from "react"

type Form = z.infer<typeof tripSchema>

export function CreateTripPage() {
  const navigate = useNavigate()
  const [err, setErr] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(tripSchema),
    defaultValues: { baseCurrency: "INR" } as any,
  })
  const create = useCreateTrip()
  async function onSubmit(v: Form) {
    try {
      const id = await create.mutateAsync({
        name: v.name,
        destination: v.destination,
        start_date: v.startDate,
        end_date: v.endDate,
        base_currency: v.baseCurrency,
      })
      navigate(`/trips/${id}`)
    } catch (e: any) {
      setErr(e.message)
    }
  }
  return (
    <FlowShell
      eyebrow="NEW WORKSPACE"
      title="Plan first. Split as you go."
      copy="Start a shared record for the journey."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <label className="block text-xs font-semibold text-ink-soft">
          TRIP NAME
          <input
            {...register("name")}
            className={input}
            placeholder="e.g. Tokyo spring escape"
          />
          {errors.name && (
            <span className="text-xs text-owe">{errors.name.message}</span>
          )}
        </label>
        <label className="block text-xs font-semibold text-ink-soft">
          DESTINATION
          <input
            {...register("destination")}
            className={input}
            placeholder="e.g. Tokyo, Japan"
          />
          {errors.destination && (
            <span className="text-xs text-owe">
              {errors.destination.message}
            </span>
          )}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-ink-soft">
            START DATE
            <input type="date" {...register("startDate")} className={input} />
            {errors.startDate && (
              <span className="text-xs text-owe">
                {errors.startDate.message}
              </span>
            )}
          </label>
          <label className="block text-xs font-semibold text-ink-soft">
            END DATE
            <input type="date" {...register("endDate")} className={input} />
            {errors.endDate && (
              <span className="text-xs text-owe">{errors.endDate.message}</span>
            )}
          </label>
        </div>
        <label htmlFor="baseCurrency" className="block text-xs font-semibold text-ink-soft">
          BASE CURRENCY
          <select id="baseCurrency" {...register("baseCurrency")} className={input}>
            <option value="INR">🇮🇳 INR — Indian Rupee</option>
            <option value="USD">🇺🇸 USD — US Dollar</option>
            <option value="EUR">🇪🇺 EUR — Euro</option>
            <option value="GBP">🇬🇧 GBP — British Pound</option>
            <option value="JPY">🇯🇵 JPY — Japanese Yen</option>
            <option value="AED">🇦🇪 AED — UAE Dirham</option>
            <option value="SGD">🇸🇬 SGD — Singapore Dollar</option>
          </select>
          {errors.baseCurrency && (
            <span className="text-xs text-owe">
              {errors.baseCurrency.message}
            </span>
          )}
        </label>
        {err && <p role="alert" className="rounded-xl bg-owe-soft px-3 py-2 text-sm font-medium text-owe">{err.includes("PERMISSION_DENIED") ? "Permission denied — are you an admin?" : err}</p>}
        <button
          disabled={isSubmitting || create.isPending}
          aria-busy={isSubmitting || create.isPending}
          className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60 shadow-sm transition-colors"
        >
          {create.isPending ? "Creating trip…" : <>Create trip <ArrowRight size={17} /></>}
        </button>
      </form>
    </FlowShell>
  )
}

const input =
  "mt-1.5 w-full rounded-xl border border-hair bg-surface px-3 py-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-brand focus:ring-2 focus:ring-brand-soft"
function FlowShell({
  eyebrow,
  title,
  copy,
  children,
}: {
  eyebrow: string; title: string; copy: string; children: React.ReactNode
}) {
  return (
    <main className="min-h-screen bg-canvas p-4 sm:grid sm:place-items-center">
      <section className="mx-auto w-full max-w-[520px] pt-5 sm:pt-0">
        <Link
          to="/trips"
          className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft hover:text-ink"
        >
          <ArrowLeft size={17} /> All trips
        </Link>
        <div className="mt-6 overflow-hidden rounded-xl border border-hair bg-surface shadow-[0_18px_50px_rgba(28,36,48,.09)]">
          <div className="border-b border-hair bg-canvas/50 p-7">
            <p className="font-mono text-[11px] font-semibold tracking-[.14em] text-brand">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
              {copy}
            </p>
          </div>
          <div className="p-7">{children}</div>
        </div>
      </section>
    </main>
  )
}
