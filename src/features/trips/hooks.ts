import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getSupabase } from "@/lib/supabase"
import { fetchTrips, fetchTrip, createTrip, joinByCode } from "./api"

export const tripKeys = {
  all: ["trips"] as const,
  list: () => [...tripKeys.all, "list"] as const,
  detail: (id: string) => [...tripKeys.all, "detail", id] as const,
}

export function useTripsQuery() {
  return useQuery({
    queryKey: tripKeys.list(),
    queryFn: fetchTrips,
    enabled: true,
  })
}

export function useTrip(id: string) {
  return useQuery({
    queryKey: tripKeys.detail(id),
    queryFn: () => fetchTrip(id),
    enabled: true,
    retry: false,
  })
}

export function useCreateTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createTrip,
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.all }),
  })
}
export function useJoinTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: joinByCode,
    onSuccess: () => qc.invalidateQueries({ queryKey: tripKeys.all }),
  })
}
