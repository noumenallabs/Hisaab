/** Domain error codes — spec §9.2
 * Stable server codes mapped to user-safe copy. Never expose raw PostgREST codes.
 */

export const ERROR_CODES = [
  "AUTH_REQUIRED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "TRIP_NOT_ACTIVE",
  "TRIP_ARCHIVED",
  "INVITE_INVALID",
  "INVITE_EXPIRED",
  "INVITE_EXHAUSTED",
  "LAST_OWNER",
  "MEMBER_HAS_BALANCE",
  "BALANCE_CHANGED",
  "VALIDATION_FAILED",
  "CONFLICT",
  "RATE_LIMITED",
  "AUDIT_IMMUTABLE",
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  AUTH_REQUIRED: "Please sign in to continue.",
  PERMISSION_DENIED: "You don't have permission for that action.",
  NOT_FOUND: "We couldn't find that.",
  TRIP_NOT_ACTIVE: "This trip isn't active — that change isn't allowed right now.",
  TRIP_ARCHIVED: "This trip is archived and can't be changed.",
  INVITE_INVALID: "That invite code isn't valid.",
  INVITE_EXPIRED: "That invite has expired.",
  INVITE_EXHAUSTED: "That invite has already been used the maximum number of times.",
  LAST_OWNER: "A trip must keep at least one owner.",
  MEMBER_HAS_BALANCE: "That member still has a balance and can't be removed.",
  BALANCE_CHANGED: "Balances changed — please review and try again.",
  VALIDATION_FAILED: "Please check the highlighted fields.",
  CONFLICT: "Someone else updated this just now — please review and try again.",
  RATE_LIMITED: "Too many attempts — please wait a moment and try again.",
  AUDIT_IMMUTABLE: "Audit history can't be changed.",
}

export function mapErrorCode(raw: unknown): ErrorCode | null {
  const msg = String(raw ?? "")
  for (const code of ERROR_CODES) {
    if (msg.includes(code)) return code
  }
  return null
}

export function toUserMessage(raw: unknown, fallback = "Something went wrong. Please try again."): string {
  const code = mapErrorCode(raw)
  if (code) return ERROR_MESSAGES[code]
  // Do not expose raw infra messages that contain UUIDs, stack traces, or PostgREST codes
  const s = String(raw ?? "")
  if (s.match(/[0-9a-f]{8}-[0-9a-f]{4}/i)) return fallback
  if (s.match(/PGRST|PostgREST|supabase/i)) return fallback
  if (s.length > 160) return fallback
  return s || fallback
}

export function isValidationError(raw: unknown): boolean {
  return mapErrorCode(raw) === "VALIDATION_FAILED"
}
