interface HissaabLogoProps {
  size?: number
  showWordmark?: boolean
  className?: string
  textSize?: string
}

export function HissaabLogo({
  size = 36,
  showWordmark = true,
  className = "",
  textSize = "text-xl",
}: HissaabLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Icon Squircle */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 transition-transform duration-200 hover:scale-105"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="hissaab-bg-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563EB" />
            <stop offset="1" stopColor="#1D4ED8" />
          </linearGradient>
          <linearGradient id="hissaab-accent" x1="12" y1="12" x2="36" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#E0E7FF" />
          </linearGradient>
          <filter id="hissaab-shadow" x="0" y="2" width="48" height="48" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1E3A8A" floodOpacity="0.25" />
          </filter>
        </defs>

        {/* Squircle base badge */}
        <rect
          width="48"
          height="48"
          rx="13"
          fill="url(#hissaab-bg-grad)"
          filter="url(#hissaab-shadow)"
        />

        {/* Subtle inner highlight border */}
        <rect
          x="0.75"
          y="0.75"
          width="46.5"
          height="46.5"
          rx="12.25"
          stroke="white"
          strokeOpacity="0.18"
          strokeWidth="1.5"
        />

        {/* Geometric 'H' with split/settlement motif */}
        {/* Left vertical bar */}
        <rect
          x="13.5"
          y="12"
          width="5.5"
          height="24"
          rx="2.75"
          fill="url(#hissaab-accent)"
        />

        {/* Right vertical bar */}
        <rect
          x="29"
          y="12"
          width="5.5"
          height="24"
          rx="2.75"
          fill="url(#hissaab-accent)"
        />

        {/* Horizontal balance crossbar connecting them */}
        <rect
          x="15"
          y="21.25"
          width="18"
          height="5.5"
          rx="2.75"
          fill="url(#hissaab-accent)"
        />

        {/* Equal/settled indicator accent dot in emerald */}
        <circle
          cx="33"
          cy="13.5"
          r="2.5"
          fill="#10B981"
          stroke="#1E3A8A"
          strokeWidth="1"
        />
      </svg>

      {/* Wordmark */}
      {showWordmark && (
        <span className={`font-black tracking-tight text-ink ${textSize}`}>
          Hissaab
        </span>
      )}
    </div>
  )
}
