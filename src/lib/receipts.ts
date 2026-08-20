import { getSupabase } from "./supabase"

const ALLOWED = new Set(["image/jpeg","image/png","image/webp","application/pdf"])
const MAX = 10*1024*1024

export function validateReceiptFile(f: File) {
  if (!ALLOWED.has(f.type)) throw new Error("Receipt must be JPEG, PNG, WebP, or PDF")
  if (f.size > MAX) throw new Error("Receipt must be ≤ 10 MB")
}

export async function uploadReceipt(tripId: string, expenseId: string, file: File) {
  validateReceiptFile(file)
  const supabase = getSupabase()
  if (!supabase) throw new Error("Supabase not configured")
  const ext = file.name.split(".").pop()?.toLowerCase() || (file.type === "application/pdf" ? "pdf" : "jpg")
  const path = `${tripId}/${expenseId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

export async function getSignedReceiptUrl(path: string, expiresSec = 600) {
  const supabase = getSupabase()
  if (!supabase) throw new Error("Supabase not configured")
  const { data, error } = await supabase.storage.from("receipts").createSignedUrl(path, expiresSec)
  if (error) throw error
  return data.signedUrl
}

export async function removeReceipt(path: string) {
  const supabase = getSupabase()
  if (!supabase) return
  await supabase.storage.from("receipts").remove([path])
}
