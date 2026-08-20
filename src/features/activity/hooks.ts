import { useInfiniteQuery } from "@tanstack/react-query"
import { fetchAudit } from "./api"
import { getSupabase } from "@/lib/supabase"

export function useActivity(tripId: string) {
  return useInfiniteQuery({
    queryKey: ["activity", tripId],
    queryFn: ({ pageParam }) => fetchAudit(tripId, pageParam as any),
    initialPageParam: undefined as any,
    getNextPageParam: (lastPage: any[]) =>
      lastPage.length
        ? {
            created_at: lastPage[lastPage.length - 1].created_at,
            id: lastPage[lastPage.length - 1].id,
          }
        : undefined,
    enabled: !!tripId,
  })
}
