"use client"

/**
 * Sparkline — inline area+line chart for trend cells.
 *
 *   <Sparkline points={[32, 37, 41, 39, 44, 48]} />
 */
export function Sparkline({
  points,
  width = 120,
  height = 28,
  showDot = true,
}: {
  points: number[]
  width?: number
  height?: number
  showDot?: boolean
}) {
  if (!points.length) return null
  const max = Math.max(...points)
  const min = Math.min(...points)
  const range = max - min || 1
  const step = width / Math.max(1, points.length - 1)
  const coords = points.map((p, i): [number, number] => [
    i * step,
    height - ((p - min) / range) * (height - 4) - 2,
  ])
  const path = coords.map((c, i) => (i === 0 ? "M" : "L") + c[0].toFixed(1) + " " + c[1].toFixed(1)).join(" ")
  const fill = `${path} L ${width} ${height} L 0 ${height} Z`
  const last = coords[coords.length - 1]!

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <path d={fill} fill="var(--color-accent)" opacity="0.12" />
      <path
        d={path}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {showDot && <circle cx={last[0]} cy={last[1]} r="2.5" fill="var(--color-accent)" />}
    </svg>
  )
}

/**
 * UtilDial — circular progress ring with centre percent.
 *
 *   <UtilDial pct={0.68} />
 */
export function UtilDial({ pct, size = 56 }: { pct: number; size?: number }) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const off = c - Math.max(0, Math.min(1, pct)) * c
  const color =
    pct > 0.95
      ? "var(--danger)"
      : pct > 0.7
        ? "var(--color-accent)"
        : pct > 0.3
          ? "var(--warm)"
          : "var(--ink-soft)"
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline-soft)" strokeWidth="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.22,.61,.36,1)" }}
      />
      <text
        x={size / 2}
        y={size / 2 + 4}
        textAnchor="middle"
        fontSize="12"
        fontFamily="var(--font-body)"
        fill="var(--ink)"
        className="tabular-nums"
        fontWeight={600}
      >
        {Math.round(pct * 100)}
      </text>
    </svg>
  )
}
