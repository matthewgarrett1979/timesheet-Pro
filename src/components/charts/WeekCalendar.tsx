"use client"

/**
 * WeekCalendar — Mon–Fri hour grid with positioned time blocks.
 * Pure presentational client component.
 *
 *   <WeekCalendar
 *     schedule={[{ day: 0, start: 9, end: 10.5, kind: "meeting", title: "Standup", client: "Acme" }]}
 *     dayLabels={["Mon","Tue","Wed","Thu","Fri"]}
 *     dayDates={[13,14,15,16,17]}
 *     todayIdx={3}
 *     nowHour={14.7}
 *   />
 */

export type ScheduleBlock = {
  day: number
  start: number
  end: number
  kind: "booked" | "scheduled" | "meeting" | "focus"
  title: string
  client?: string
}

export function WeekCalendar({
  schedule,
  dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri"],
  dayDates,
  todayIdx,
  nowHour,
  startHour = 8,
  endHour = 19,
  pxPerHour = 52,
}: {
  schedule: ScheduleBlock[]
  dayLabels?: string[]
  dayDates: (number | string)[]
  todayIdx?: number
  nowHour?: number
  startHour?: number
  endHour?: number
  pxPerHour?: number
}) {
  const HOURS = endHour - startHour
  const hourMarks = Array.from({ length: HOURS }, (_, i) => startHour + i)

  const fmt = (h: number) => {
    const hh = Math.floor(h)
    const mm = Math.round((h - hh) * 60)
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
  }

  return (
    <div className="wc-grid">
      <div className="wc-rail">
        <div className="wc-rail-head" />
        {hourMarks.map((h) => (
          <div key={h} className="wc-rail-slot" style={{ height: pxPerHour }}>
            <span>{String(h).padStart(2, "0")}:00</span>
          </div>
        ))}
      </div>
      <div className="wc-cols" style={{ gridTemplateColumns: `repeat(${dayLabels.length}, 1fr)` }}>
        {dayLabels.map((dl, dayIdx) => {
          const items = schedule.filter((s) => s.day === dayIdx)
          const isToday = dayIdx === todayIdx
          const isFuture = todayIdx !== undefined && dayIdx > todayIdx
          return (
            <div key={dayIdx} className={`wc-col ${isToday ? "is-today" : ""} ${isFuture ? "is-future" : ""}`}>
              <div className="wc-col-head">
                <div className="wc-day">{dl}</div>
                <div className="wc-date">{dayDates[dayIdx]}</div>
              </div>
              <div className="wc-col-body" style={{ height: HOURS * pxPerHour }}>
                {hourMarks.map((h) => (
                  <div key={h} className="wc-gridline" style={{ top: (h - startHour) * pxPerHour }} />
                ))}
                {isToday && nowHour !== undefined && nowHour >= startHour && nowHour <= endHour && (
                  <div className="wc-now" style={{ top: (nowHour - startHour) * pxPerHour }}>
                    <span>NOW</span>
                  </div>
                )}
                {items.map((it, i) => {
                  const top = (it.start - startHour) * pxPerHour
                  const height = (it.end - it.start) * pxPerHour
                  const isShort = it.end - it.start < 0.6
                  return (
                    <div
                      key={i}
                      className={`wc-block is-${it.kind} ${isShort ? "is-short" : ""}`}
                      style={{ top, height: height - 2 }}
                      title={`${it.title} — ${fmt(it.start)}–${fmt(it.end)}`}
                    >
                      <div className="wc-block-title">{it.title}</div>
                      {!isShort && (
                        <div className="wc-block-meta">
                          <span className="wc-block-time">{fmt(it.start)}–{fmt(it.end)}</span>
                          {it.client && <span className="wc-block-client">{it.client}</span>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <style>{`
        .wc-grid { display: grid; grid-template-columns: 56px 1fr; background: var(--surface); border-radius: 8px; overflow: hidden; border: 1px solid var(--hairline-soft); }
        .wc-rail { display: flex; flex-direction: column; border-right: 1px solid var(--hairline-soft); background: var(--paper-2); }
        .wc-rail-head { height: 44px; border-bottom: 1px solid var(--hairline-soft); }
        .wc-rail-slot { display: flex; align-items: flex-start; justify-content: flex-end; padding: 4px 8px 0;
          font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.05em; color: var(--ink-dim); font-weight: 500;
          border-bottom: 1px dashed color-mix(in srgb, var(--hairline-soft) 60%, transparent); }
        .wc-rail-slot:last-child { border-bottom: 0; }
        .wc-cols { display: grid; }
        .wc-col { border-right: 1px solid var(--hairline-soft); position: relative; min-width: 0; }
        .wc-col:last-child { border-right: 0; }
        .wc-col.is-today { background: color-mix(in srgb, var(--warm) 4%, var(--surface)); }
        .wc-col.is-future .wc-col-body { background-image: repeating-linear-gradient(45deg, transparent, transparent 6px, color-mix(in srgb, var(--hairline-soft) 40%, transparent) 6px, color-mix(in srgb, var(--hairline-soft) 40%, transparent) 7px); }
        .wc-col-head { height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 14px;
          border-bottom: 1px solid var(--hairline-soft); background: var(--paper-2); }
        .wc-col.is-today .wc-col-head { background: color-mix(in srgb, var(--warm) 12%, var(--paper-2)); }
        .wc-day { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink-soft); font-weight: 600; }
        .wc-date { font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
        .wc-col.is-today .wc-date { color: var(--warm); }
        .wc-col-body { position: relative; padding: 0 4px; }
        .wc-gridline { position: absolute; left: 0; right: 0; height: 1px; background: var(--hairline-soft); opacity: 0.6; }
        .wc-now { position: absolute; left: -2px; right: -2px; height: 0; border-top: 2px solid var(--danger); z-index: 5; }
        .wc-now span { position: absolute; top: -9px; left: -42px; background: var(--danger); color: white;
          font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.14em; font-weight: 600; padding: 3px 6px; border-radius: 4px; }
        .wc-block { position: absolute; left: 4px; right: 4px; padding: 6px 10px; border-radius: 6px;
          border-left: 3px solid var(--color-accent); background: color-mix(in srgb, var(--color-accent) 10%, var(--surface));
          overflow: hidden; cursor: pointer; transition: all 140ms cubic-bezier(.22,.61,.36,1); }
        .wc-block:hover { transform: translateX(1px) scale(1.005); box-shadow: 0 6px 16px -6px rgba(26,31,46,0.2); z-index: 3; }
        .wc-block.is-short { padding: 4px 8px; }
        .wc-block-title { font-family: var(--font-body); font-size: 11.5px; font-weight: 600; color: var(--ink);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.25; }
        .wc-block-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 10px; color: var(--ink-soft); white-space: nowrap; overflow: hidden; }
        .wc-block-time { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: 0.04em; color: var(--ink-soft); font-weight: 500; }
        .wc-block-client { font-size: 10px; color: var(--ink-dim); overflow: hidden; text-overflow: ellipsis; }
        .wc-block.is-scheduled { border: 1px dashed color-mix(in srgb, var(--color-accent) 40%, transparent);
          border-left: 3px dashed var(--color-accent); background: color-mix(in srgb, var(--color-accent) 5%, var(--surface)); }
        .wc-block.is-meeting { border-left-color: var(--warm); background: color-mix(in srgb, var(--warm) 12%, var(--surface)); }
        .wc-block.is-focus { border-left-color: var(--ok); background: color-mix(in srgb, var(--ok) 10%, var(--surface)); }
      `}</style>
    </div>
  )
}
