import { parseCurrencyInput, toMinor } from "@/features/expenses/money"

export function CurrencyInput({ valueMinor, onChange, currency = "INR", decimals = 0 }: { valueMinor: number; onChange: (minor: number | null) => void; currency?: string; decimals?: number }) {
  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseCurrencyInput(e.target.value, decimals)
    onChange(parsed)
  }
  const display = (valueMinor / Math.pow(10, decimals)).toString()
  return (
    <div className="relative">
      <span className="absolute left-3 top-3 text-xs font-semibold text-ink-faint">{currency}</span>
      <input defaultValue={display} onChange={handle} placeholder="0" className="w-full rounded-md border border-hair bg-surface py-3 pl-12 pr-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft" />
    </div>
  )
}
