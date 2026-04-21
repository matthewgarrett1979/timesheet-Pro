"use client"

/**
 * BurnDown — project budget vs. logged hours, with a 75% warning tick.
 *
 *   <BurnDown budget={160} logged={112} />
 */
export function BurnDown({
  budget,
  logged,
  showLabels = true,
}: {
  budget: number
  logged: number
  showLabels?: boolean
}) {
  const pct = Math.max(0, Math.min(1, budget > 0 ? logged / budget : 0))
  const danger = pct >= 0.9
  const warn = pct >= 0.75 && pct < 0.9
  const color = danger
    ? "var(--danger)"
    : warn
      ? "var(--warm)"
      : "var(--color-accent)"

  return (
    <div className="w-full">
      {showLabels && (
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="ds-num tabular-nums" style={{ fontSize: 13, color: "var(--ink)" }}>
            {logged.toFixed(0)}h
            <span className="ds-dim" style={{ fontWeight: 400 }}> / {budget}h</span>
          </span>
          <span className="tabular-nums font-mono" style={{ fontSize: 11, color, fontWeight: 600 }}>
            {Math.round(pct * 100)}%
          </span>
        </div>
      )}
      <div
        className="relative rounded-sm overflow-hidden"
        style={{ height: 6, background: "var(--hairline-soft)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{
            width: `${pct * 100}%`,
            background: color,
            transition: "width 900ms cubic-bezier(.22,.61,.36,1)",
          }}
        />
        {/* 75% warning tick */}
        <div
          className="absolute top-0 bottom-0"
          style={{ left: "75%", width: 1, background: "var(--ink)", opacity: 0.2 }}
        />
      </div>
    </div>
  )
}
