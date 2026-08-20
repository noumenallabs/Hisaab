import { useEffect, useState } from "react"
import { Link, useNavigate, useParams, useSearchParams } from "react-router"
import { ArrowLeft, ArrowRight, KeyRound, Mail, User, CheckCircle2 } from "lucide-react"
import { getSupabase } from "@/lib/supabase"
import { resolveInvite, joinWithEmailAndCode, joinByCode } from "@/features/trips/api"
import { useAuth } from "@/lib/auth"
import { AuthShell } from "@/components/navigation/AuthShell"

type InviteInfo = { trip_name: string; destination: string } | null

export function InviteJoinPage() {
  const { code: paramCode } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { user, setCustomUser } = useAuth()
  const [code, setCode] = useState(paramCode ?? search.get("code") ?? "")
  const [email, setEmail] = useState(user?.email ?? search.get("email") ?? "")
  const [name, setName] = useState(user?.name ?? "")
  const [info, setInfo] = useState<InviteInfo>(null)
  const [status, setStatus] = useState<"idle" | "validating" | "preview" | "joining">("idle")
  const [err, setErr] = useState("")

  // Debounced lookup
  useEffect(() => {
    if (!code || code.length < 4) {
      setInfo(null)
      setStatus("idle")
      return
    }
    let cancelled = false
    setStatus("validating")
    const t = setTimeout(async () => {
      const supabase = getSupabase()
      if (!supabase) {
        if (code.toUpperCase() === "LISBON24") {
          if (!cancelled) {
            setInfo({ trip_name: "Lisbon Long Weekend", destination: "Lisbon, Portugal" })
            setStatus("preview")
          }
        } else {
          if (!cancelled) {
            setInfo({ trip_name: "Trip Preview", destination: "Shared Workspace" })
            setStatus("preview")
          }
        }
        return
      }
      const r = await resolveInvite(code.trim())
      if (cancelled) return
      if (r) {
        setInfo({ trip_name: r.trip_name, destination: r.destination })
        setStatus("preview")
        setErr("")
      } else {
        setInfo(null)
        setStatus("idle")
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [code])

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setErr("")
    const cleanCode = code.trim().toUpperCase()
    const cleanEmail = email.trim().toLowerCase()

    if (!cleanCode) return setErr("Please enter an invite code.")
    if (!cleanEmail) return setErr("Please enter your email address.")

    setStatus("joining")
    try {
      // Direct Email + Invite Code Join (works seamlessly whether user is logged in or guest)
      const res = await joinWithEmailAndCode(cleanEmail, cleanCode, name.trim() || user?.name)
      setCustomUser({
        id: res.user_id,
        email: res.email,
        name: res.name || user?.name || cleanEmail.split("@")[0] || "Traveler",
      })
      navigate(`/trips/${res.trip_id}`)
    } catch (e: any) {
      const msg = e.message ?? String(e)
      if (msg.includes("INVITE_NOT_FOUND") || msg.includes("INVITE_INVALID")) {
        setErr("Invalid or revoked invite code. Please check with your host.")
      } else if (msg.includes("INVITE_EXPIRED")) {
        setErr("This invite has expired. Please ask your host for a new code.")
      } else if (msg.includes("INVITE_EXHAUSTED")) {
        setErr("This invite has reached its maximum allowed uses.")
      } else if (msg.includes("TRIP_NOT_ACTIVE") || msg.includes("TRIP_ARCHIVED")) {
        setErr("This trip is archived and no longer accepting members.")
      } else if (msg.includes("INVALID_EMAIL")) {
        setErr("Please enter a valid email address.")
      } else {
        setErr(msg)
      }
      setStatus("preview")
    }
  }

  const inviteParam = code.trim().toUpperCase()

  return (
    <AuthShell
      title="Join with your email"
      subtitle="Enter your email and the invite code shared by your host. No password needed."
    >
      <form onSubmit={handleJoin} className="space-y-4">
        {/* Invite Code Input */}
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Invite Code
          <div className="relative mt-1.5">
            <KeyRound className="absolute left-3.5 top-3.5 text-ink-faint" size={17} />
            <input
              value={code}
              onChange={(e) => {
                const v = e.target.value.toUpperCase()
                setCode(v)
                setErr("")
              }}
              className="w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-2.5 pl-10 font-mono text-sm uppercase tracking-[.16em] outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="e.g. TOKYO24"
              autoCapitalize="characters"
              required
            />
          </div>
        </label>

        {status === "validating" && (
          <p className="text-xs text-brand animate-pulse" role="status">Validating invite code…</p>
        )}

        {info && status === "preview" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-center gap-3">
            <CheckCircle2 className="text-emerald-600 shrink-0" size={20} />
            <div>
              <p className="text-sm font-bold text-emerald-900">{info.trip_name}</p>
              <p className="text-xs text-emerald-700">{info.destination}</p>
            </div>
          </div>
        )}

        {/* Email Input */}
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Your Email Address
          <div className="relative mt-1.5">
            <Mail className="absolute left-3.5 top-3.5 text-ink-faint" size={17} />
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setErr("")
              }}
              className="w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-2.5 pl-10 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="you@example.com"
              required
            />
          </div>
        </label>

        {/* Optional Display Name */}
        <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
          Your Name <span className="font-normal text-ink-faint lowercase">(optional)</span>
          <div className="relative mt-1.5">
            <User className="absolute left-3.5 top-3.5 text-ink-faint" size={17} />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-hair bg-surface px-3 py-2.5 pl-10 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              placeholder="e.g. Sarah"
            />
          </div>
        </label>

        {err && (
          <p className="rounded-xl bg-owe-soft p-3 text-xs font-semibold text-owe border border-owe/20" role="alert">
            {err}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "joining" || !code.trim() || !email.trim()}
          className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {status === "joining" ? "Joining trip…" : <>Join & Open Trip <ArrowRight size={17} /></>}
        </button>

        {!getSupabase() ? (
          <div className="rounded-xl border border-hair bg-canvas/60 p-3 text-center text-[11px] text-ink-faint">
            Demo Code: <code className="font-mono text-brand font-bold">LISBON24</code>
          </div>
        ) : (
          <div className="rounded-xl border border-hair bg-canvas/60 p-3 text-center text-[11px] text-ink-faint">
            Need a code? Ask your trip admin for their invite code.
          </div>
        )}
      </form>
    </AuthShell>
  )
}
