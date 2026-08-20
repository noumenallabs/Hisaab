export type Transfer = { fromId: string; toId: string; amount: number }

export function netBalances(
  expenses: Array<{
    payers: { userId: string; amount: number }[]
    splits: { userId: string; amount: number }[]
    deleted?: boolean
  }>,
  settlements: Array<{ fromId: string; toId: string; amount: number }>,
  memberIds: string[],
): Record<string, number> {
  const net: Record<string, number> = {}
  for (const id of memberIds) net[id] = 0
  for (const e of expenses) {
    if (e.deleted) continue
    for (const p of e.payers) net[p.userId] = (net[p.userId] ?? 0) + p.amount
    for (const s of e.splits) net[s.userId] = (net[s.userId] ?? 0) - s.amount
  }
  for (const s of settlements) {
    net[s.fromId] = (net[s.fromId] ?? 0) + s.amount
    net[s.toId] = (net[s.toId] ?? 0) - s.amount
  }
  return net
}

export function simplifyDebts(net: Record<string, number>): Transfer[] {
  const creditors: { id: string; amt: number }[] = []
  const debtors: { id: string; amt: number }[] = []
  for (const id of Object.keys(net)) {
    const v = Math.round(net[id])
    if (v > 0) creditors.push({ id, amt: v })
    else if (v < 0) debtors.push({ id, amt: -v })
  }
  creditors.sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id))
  debtors.sort((a, b) => b.amt - a.amt || a.id.localeCompare(b.id))
  const transfers: Transfer[] = []
  let i = 0,
    j = 0
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt)
    if (pay > 0)
      transfers.push({
        fromId: debtors[i].id,
        toId: creditors[j].id,
        amount: pay,
      })
    debtors[i].amt -= pay
    creditors[j].amt -= pay
    if (debtors[i].amt === 0) i++
    if (creditors[j].amt === 0) j++
  }
  return transfers
}

export function tripNetMinor(
  balances: { user_id: string; net_minor: number }[],
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const b of balances) out[b.user_id] = b.net_minor
  return out
}
