import React, { useState, useEffect } from "react"
import { decimalsFor, fromMinor, parseCurrencyInput } from "@/lib/currency"

export type CurrencyInputProps = {
  valueMinor?: number | null
  onChange: (minor: number | null) => void
  currency?: string
  decimals?: number
  disabled?: boolean
  className?: string
  placeholder?: string
  id?: string
  name?: string
  "aria-label"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}

export function CurrencyInput({
  valueMinor,
  onChange,
  currency = "INR",
  decimals,
  disabled = false,
  className = "",
  placeholder = "0",
  id,
  name,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedby,
  "aria-invalid": ariaInvalid,
}: CurrencyInputProps) {
  const effectiveDecimals = decimals ?? decimalsFor(currency)

  const [text, setText] = useState<string>(() => {
    if (valueMinor == null) return ""
    return String(fromMinor(valueMinor, effectiveDecimals))
  })

  // Synchronize internal text with incoming valueMinor when updated externally
  useEffect(() => {
    const currentParsed = parseCurrencyInput(text, currency)
    if (currentParsed !== valueMinor) {
      if (valueMinor == null) {
        if (text !== "") setText("")
      } else {
        setText(String(fromMinor(valueMinor, effectiveDecimals)))
      }
    }
  }, [valueMinor, currency, effectiveDecimals])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setText(val)
    const parsed = parseCurrencyInput(val, currency)
    onChange(parsed)
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-faint select-none">
        {currency}
      </span>
      <input
        id={id}
        name={name}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        value={text}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full rounded-xl border border-hair bg-surface py-2.5 pl-12 pr-3 text-sm font-semibold tabular-nums outline-none transition-colors focus:border-brand focus:ring-1 focus:ring-brand disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedby}
        aria-invalid={ariaInvalid}
      />
    </div>
  )
}
