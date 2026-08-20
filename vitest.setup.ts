import "@testing-library/jest-dom"
import { afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"

// jsdom globals
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// crypto.randomUUID for tests
if (!globalThis.crypto?.randomUUID) {
  // @ts-ignore
  globalThis.crypto = { ...globalThis.crypto, randomUUID: () => `test-${Math.random().toString(36).slice(2, 10)}` }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  try {
    if (typeof window !== "undefined" && window.localStorage?.clear) window.localStorage.clear()
    else if (typeof globalThis !== "undefined" && (globalThis as any).localStorage?.clear) (globalThis as any).localStorage.clear()
  } catch { /* jsdom not available in node integration tests */ }
})
