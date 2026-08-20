import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  fetchExpenses,
  fetchExpense,
  saveExpense,
  softDeleteExpense,
  restoreExpense,
} from "./api"
import { getSupabase } from "@/lib/supabase"

export const expenseKeys = {
  all: ["expenses"] as const,
  list: (tripId: string) => [...expenseKeys.all, tripId] as const,
}

export function useExpenses(tripId: string, opts?: { includeDeleted?: boolean }) {
  return useQuery({
    queryKey: [...expenseKeys.list(tripId), opts?.includeDeleted ? "withDeleted" : "active"] as const,
    queryFn: () => fetchExpenses(tripId, opts),
    enabled: !!tripId,
  })
}
export function useExpense(tripId: string, expenseId: string) {
  return useQuery({
    queryKey: [...expenseKeys.list(tripId), "detail", expenseId],
    queryFn: () => fetchExpense(tripId, expenseId),
    enabled: !!tripId && !!expenseId,
  })
}
export function useSaveExpense(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: saveExpense,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.list(tripId) })
      qc.invalidateQueries({ queryKey: ["balances", tripId] })
    },
  })
}
export function useSoftDelete(tripId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: string }) =>
      softDeleteExpense(id, req),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: expenseKeys.list(tripId) }),
  })
}
