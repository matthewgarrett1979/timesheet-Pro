"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Counts up from 0 to `value` on mount (and whenever value changes).
 * Uses requestAnimationFrame + cubic easing. Respects tabular numerals.
 *
 *   <AnimatedNumber value={37.5} decimals={1} suffix="h" />
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 900,
  prefix = "",
  suffix = "",
  className = "",
  style,
}: {
  value: number
  decimals?: number
  duration?: number
  prefix?: string
  suffix?: string
  className?: string
  style?: React.CSSProperties
}) {
  const [display, setDisplay] = useState(0)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    const from = 0
    const to = Number(value) || 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (to - from) * eased)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [value, duration])

  const formatted =
    decimals === 0
      ? Math.round(display).toLocaleString("en-GB")
      : display.toLocaleString("en-GB", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })

  return (
    <span className={`tabular-nums ${className}`} style={style}>
      {prefix}{formatted}{suffix}
    </span>
  )
}
