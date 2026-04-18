"use client"

import { useState, useEffect } from "react"

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

// Stable project colour palette
const PROJECT_COLORS = [
  "#2563eb", "#16a34a", "#db2777", "#ca8a04",
  "#7c3aed", "#ea580c", "#0891b2", "#dc2626",
  "#059669", "#d97706", "#4f46e5", "#be185d",
]

interface Allocation {
  id: string
  userId: string
  date: string
  plannedHours: number | string
  notes: string | null
  user:    { id: string; name: string }
  project: { id: string; name: string }
}

function weekStart(d: Date): Date {
  const r = new Date(d)
  const day = r.getDay() || 7
  r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() - day + 1)
  return r
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default function TeamAllocationCalendar() {
  const now    = new Date()
  const monDay = weekStart(now)
  const sunDay = addDays(monDay, 6)
  sunDay.setHours(23, 59, 59, 999)

  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [loading, setLoading] = useState(false)
  const [tooltip, setTooltip] = useState<{ allocId: string; x: number; y: number } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(
      `/api/allocations?dateFrom=${toISO(monDay)}T00:00:00.000Z&dateTo=${toISO(sunDay)}T23:59:59.999Z`
    )
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setAllocations(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Assign stable colour per project
  const projectIds = Array.from(new Set(allocations.map((a) => a.project.id)))
  const projectColorMap: Record<string, string> = {}
  projectIds.forEach((pid, i) => {
    projectColorMap[pid] = PROJECT_COLORS[i % PROJECT_COLORS.length]!
  })

  // Build: member → dayIndex → allocations[]
  const userIds   = Array.from(new Set(allocations.map((a) => a.userId)))
  const userNames: Record<string, string> = {}
  allocations.forEach((a) => { userNames[a.userId] = a.user.name })

  const calMap: Record<string, Allocation[][]> = {}
  userIds.forEach((uid) => {
    calMap[uid] = [[], [], [], [], [], [], []]
  })
  allocations.forEach((a) => {
    // getUTCDay so timezone doesn't flip the date
    const raw = new Date(a.date)
    const day = (raw.getUTCDay() || 7) - 1 // 0=Mon
    calMap[a.userId]?.[day]?.push(a)
  })

  const unallocated = userIds.filter((uid) =>
    (calMap[uid] ?? []).every((slot) => slot.length === 0)
  )

  const hoveredAlloc = tooltip
    ? allocations.find((a) => a.id === tooltip.allocId)
    : null

  const weekLabel = `${monDay.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${sunDay.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`

  if (!loading && allocations.length === 0) return null

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Team Planned Allocation</h2>
          <p className="text-xs text-gray-400">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-xs text-gray-400">Loading…</span>}
          {unallocated.length > 0 && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              ⚠ {unallocated.length} member{unallocated.length > 1 ? "s" : ""} unallocated this week
            </span>
          )}
        </div>
      </div>

      {/* Project legend */}
      {projectIds.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
          {projectIds.map((pid) => (
            <span key={pid} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0 inline-block"
                style={{ backgroundColor: projectColorMap[pid] }}
              />
              {allocations.find((a) => a.project.id === pid)?.project.name}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate" style={{ borderSpacing: "2px" }}>
          <thead>
            <tr>
              <th className="text-left py-1 pr-3 font-medium text-gray-500 min-w-[100px]">Member</th>
              {DAY_NAMES.map((d, i) => {
                const dayDate = addDays(monDay, i)
                const isToday = dayDate.toDateString() === now.toDateString()
                return (
                  <th
                    key={d}
                    className={`text-center py-1 w-16 font-medium ${isToday ? "text-blue-600" : "text-gray-400"}`}
                  >
                    <div>{d}</div>
                    <div className={`font-normal ${isToday ? "text-blue-400" : "text-gray-300"}`}>
                      {dayDate.getDate()}
                    </div>
                  </th>
                )
              })}
              <th className="text-right py-1 pl-2 font-medium text-gray-400 w-14">Total</th>
            </tr>
          </thead>
          <tbody>
            {userIds.map((uid) => {
              const days  = calMap[uid] ?? [[], [], [], [], [], [], []]
              const total = days.flat().reduce((s, a) => s + Number(a.plannedHours), 0)
              return (
                <tr key={uid}>
                  <td className="py-1.5 pr-3 font-medium text-gray-800 truncate max-w-[100px]">
                    {userNames[uid]}
                  </td>
                  {days.map((slot, di) => {
                    const dayDate = addDays(monDay, di)
                    const isToday = dayDate.toDateString() === now.toDateString()
                    const slotHours = slot.reduce((s, a) => s + Number(a.plannedHours), 0)

                    return (
                      <td
                        key={di}
                        className={`text-center py-1.5 rounded ${isToday ? "bg-blue-50" : ""}`}
                      >
                        {slot.length === 0 ? (
                          <span className="text-gray-200">—</span>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            {slot.map((a) => (
                              <div
                                key={a.id}
                                className="relative px-1.5 py-0.5 rounded text-white text-[10px] font-medium cursor-default w-full text-center"
                                style={{ backgroundColor: projectColorMap[a.project.id] ?? "#6b7280" }}
                                onMouseEnter={(e) =>
                                  setTooltip({ allocId: a.id, x: e.clientX, y: e.clientY })
                                }
                                onMouseLeave={() => setTooltip(null)}
                              >
                                {Number(a.plannedHours).toFixed(1)}h
                              </div>
                            ))}
                            {slot.length > 1 && (
                              <span className="text-[9px] text-gray-500 font-medium">
                                {slotHours.toFixed(1)}h total
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                  <td className={`text-right py-1.5 pl-2 font-semibold ${total === 0 ? "text-amber-400" : "text-gray-700"}`}>
                    {total > 0 ? `${total.toFixed(1)}h` : "—"}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Hover tooltip */}
      {hoveredAlloc && tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white text-xs rounded shadow-lg px-3 py-2 pointer-events-none max-w-[200px]"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <p className="font-semibold">{hoveredAlloc.project.name}</p>
          <p className="text-gray-300">{Number(hoveredAlloc.plannedHours).toFixed(1)}h planned</p>
          {hoveredAlloc.notes && <p className="text-gray-400 mt-0.5">{hoveredAlloc.notes}</p>}
        </div>
      )}
    </div>
  )
}
