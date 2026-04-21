"use client"

/**
 * WeekBars — compact 5- or 7-day bar chart used on dashboard cards.
 *
 *   <WeekBars days={[7.5, 8, 6.25, 4.5, 0]} todayIndex={3} />
 */
export function WeekBars({
  days,
  todayIndex = -1,
  labels = ["M", "T", "W", "T", "F", "S", "S"],
  height = 40,
}: {
  days: number[]
  todayIndex?: number
  labels?: string[]
  height?: number
}) {
  const max = Math.max(8, ...days)
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {days.map((h, i) => {
          const isToday = i === todayIndex
          const pct = Math.max(h > 0 ? 8 : 4, (h / max) * 100)
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end">
              <div
                style={{
                  width: "100%",
                  height: `${pct}%`,
                  background:
                    h > 0
                      ? isToday
                        ? "var(--warm)"
                        : "var(--color-accent)"
                      : "var(--hairline-soft)",
                  borderRadius: 2,
                  transition: "height 700ms cubic-bezier(.22,.61,.36,1)",
                  animation: `barRise 700ms ${i * 60}ms cubic-bezier(.22,.61,.36,1) both`,
                  transformOrigin: "bottom",
                }}
              />
            </div>
          )
        })}
      </div>
      <div
        className="flex justify-between mt-1.5 font-mono"
        style={{ fontSize: 9, color: "var(--ink-dim)", letterSpacing: "0.08em" }}
      >
        {labels.slice(0, days.length).map((d, i) => (
          <span
            key={i}
            className="flex-1 text-center"
            style={{ color: i === todayIndex ? "var(--warm)" : undefined, fontWeight: i === todayIndex ? 600 : 400 }}
          >
            {d}
          </span>
        ))}
      </div>
      <style>{`
        @keyframes barRise {
          from { transform: scaleY(0); opacity: 0; }
          to { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
