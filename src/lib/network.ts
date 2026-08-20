import { useSyncExternalStore, useCallback } from "react"

/** Online/offline capability — spec §9.1
 * Single source for `isOnline`; mutations consume `useCanMutate()` to block when offline.
 */

function getSnapshot(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true
}

function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb)
  window.addEventListener("offline", cb)
  return () => {
    window.removeEventListener("online", cb)
    window.removeEventListener("offline", cb)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true)
}

export function useCanMutate(): boolean {
  return useOnline()
}

export function useOfflineBlock() {
  const online = useOnline()
  const blockIfOffline = useCallback(
    (msg = "You're offline — that action isn't available right now.") => {
      if (!online) throw new Error("OFFLINE:" + msg)
      return true
    },
    [online]
  )
  return { online, canMutate: online, blockIfOffline }
}
