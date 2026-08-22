import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ArrowLeft, ArrowRight, KeyRound } from "lucide-react"
import { useJoinTrip } from "./hooks"
import { getSupabase } from "@/lib/supabase"

export function JoinTripPage() {
  const { code: paramCode } = useParams()
  const navigate = useNavigate()
  const join = useJoinTrip()
  const [code, setCode] = useState(paramCode || "")
  const [err, setErr] = useState("")
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    try {
      const id = await join.mutateAsync(code.trim())
      navigate(`/trips/${id}`)
    } catch (e: any) {
      setErr(e.message)
    }
  }
  return (
    <main className="min-h-[100dvh] bg-canvas p-4 sm:grid sm:place-items-center">
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
              JOIN A TRIP
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              Your seat is waiting.
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
              Paste an invite code from a trip owner.
            </p>
          </div>
          <div className="p-7">
            <form onSubmit={submit}>
              <label className="block text-xs font-semibold text-ink-soft">
                INVITE CODE
                <div className="relative">
                  <KeyRound
                    className="absolute left-3 top-4 text-ink-faint"
                    size={17}
                  />
                  <input
                    required
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value)
                      setErr("")
                    }}
                    className="mt-1.5 w-full rounded-md border border-hair bg-surface px-3 py-3 pl-10 text-sm font-mono uppercase tracking-[.16em] outline-none focus:border-brand"
                    placeholder="LISBON24"
                  />
                </div>
              </label>
              {err && (
                <p className="mt-2 text-xs font-medium text-owe">{err}</p>
              )}
              <button className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand text-sm font-bold text-white hover:bg-blue-700">
                Join trip <ArrowRight size={17} />
              </button>
            </form>
            <div className="mt-7 rounded-lg bg-canvas px-4 py-3 text-xs leading-5 text-ink-soft">
              <b className="text-ink">Try it:</b> enter{" "}
              <code className="font-mono text-brand">LISBON24</code> to join the
              seeded Lisbon trip.
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
