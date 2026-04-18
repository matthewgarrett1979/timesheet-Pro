"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

interface Allocation {
  id: string
  date: string
  plannedHours: number | string
  notes: string | null
  project: { id: string; name: string }
}

interface TimeEntry {
  id: string
  date: string
  hours: number | string
  description: string | null
  isBillable: boolean
  project?: { name: string } | null
}

function toDateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export default function PersonalCalendar() {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const [allocByDay, setAllocByDay]     = useState<Record<number, number>>({})
  const [loggedByDay, setLoggedByDay]   = useState<Record<number, number>>({})
  const [selectedDay, setSelectedDay]   = useState<number | null>(null)
  const [dayEntries, setDayEntries]     = useState<TimeEntry[]>([])
  const [dayAllocs,  setDayAllocs]      = useState<Allocation[]>([])
  const [loading, setLoading]           = useState(false)
  const [dayLoading, setDayLoading]     = useState(false)

  const monthStart = new Date(year, month, 1)
  const monthEnd   = new Date(year, month + 1, 0)
  const daysInMonth  = monthEnd.getDate()
  const firstWeekday = (monthStart.getDay() || 7) - 1

  const loadMonth = useCallback(async () => {
    setLoading(true)
    const from = toDateKey(year, month, 1)
    const to   = toDateKey(year, month, daysInMonth)
    const fromISO = `${from}T00:00:00.000Z`
    const toISO   = `${to}T23:59:59.999Z`

    try {
      const [allocRes, entryRes] = await Promise.all([
        fetch(`/api/allocations?dateFrom=${fromISO}&dateTo=${toISO}`),
        fetch(`/api/time-entries?dateFrom=${from}&dateTo=${to}`),
      ])

      if (allocRes.ok) {
        const allocs: Allocation[] = await allocRes.json()
        const byDay: Record<number, number> = {}
        allocs.forEach((a) => {
          const d = new Date(a.date).getUTCDate()
          byDay[d] = (byDay[d] ?? 0) + Number(a.plannedHours)
        })
        setAllocByDay(byDay)
      }

      if (entryRes.ok) {
        const entries: TimeEntry[] = await entryRes.json()
        const byDay: Record<number, number> = {}
        entries.forEach((e) => {
          const d = new Date(e.date).getDate()
          byDay[d] = (byDay[d] ?? 0) + Number(e.hours)
        })
        setLoggedByDay(byDay)
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [year, month, daysInMonth])

  useEffect(() => { loadMonth() }, [loadMonth])

  async function selectDay(day: number) {
    if (selectedDay === day) { setSelectedDay(null); return }
    setSelectedDay(day)
    setDayLoading(true)

    const dateKey = toDateKey(year, month, day)
    const fromISO = `${dateKey}T00:00:00.000Z`
    const toISO   = `${dateKey}T23:59:59.999Z`

    try {
      const [allocRes, entryRes] = await Promise.all([
        fetch(`/api/allocations?dateFrom=${fromISO}&dateTo=${toISO}`),
        fetch(`/api/time-entries?dateFrom=${dateKey}&dateTo=${dateKey}`),
      ])
      if (allocRes.ok) setDayAllocs(await allocRes.json())
      if (entryRes.ok) setDayEntries(await entryRes.json())
    } catch { /* ignore */ }
    setDayLoading(false)
  }

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
  }

  const monthLabel = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" })
  const todayDay   = year === now.getFullYear() && month === now.getMonth() ? now.getDate() : null

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Monthly View</h2>
        <div className="flex items-center gap-1.5">
          <button onClick={prevMonth} className="btn btn-secondary px-2 py-1 text-xs">‹</button>
          <span className="text-xs font-medium text-gray-600 min-w-[120px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="btn btn-secondary px-2 py-1 text-xs">›</button>
          {loading && <span className="text-xs text-gray-400 ml-1">…</span>}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-200 inline-block" />planned
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-blue-500 inline-block" />logged
        </span>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400">{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`e-${i}`} className="aspect-square" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day      = i + 1
          const planned  = allocByDay[day]  ?? 0
          const logged   = loggedByDay[day] ?? 0
          const isToday  = day === todayDay
          const selected = day === selectedDay
          const hasData  = planned > 0 || logged > 0

          let bg = "bg-gray-50"
          if (logged > 0 && planned > 0) bg = "bg-blue-500"
          else if (logged > 0) bg = "bg-blue-500"
          else if (planned > 0) bg = "bg-blue-100"

          return (
            <button
              key={day}
              className={`aspect-square rounded flex flex-col items-center justify-center text-[11px] transition-all ${bg} ${
                isToday ? "ring-2 ring-blue-400" : ""
              } ${selected ? "ring-2 ring-offset-1 ring-blue-600" : ""} ${
                hasData ? "cursor-pointer hover:opacity-80" : "hover:bg-gray-100 cursor-pointer"
              }`}
              onClick={() => selectDay(day)}
            >
              <span className={`font-medium leading-none ${logged > 0 ? "text-white" : isToday ? "text-blue-600" : "text-gray-600"}`}>
                {day}
              </span>
              {hasData && (
                <span className={`text-[9px] leading-tight font-mono ${logged > 0 ? "text-blue-100" : "text-blue-500"}`}>
                  {logged > 0 ? `${logged.toFixed(1)}h` : `${planned.toFixed(1)}h`}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Day detail panel */}
      {selectedDay && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">
              {new Date(year, month, selectedDay).toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </h3>
            <Link
              href={`/time-entries?date=${toDateKey(year, month, selectedDay)}`}
              className="text-xs text-blue-600 hover:underline"
            >
              + Log time
            </Link>
          </div>

          {dayLoading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : (
            <div className="space-y-3">
              {dayAllocs.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Planned</p>
                  <div className="space-y-1">
                    {dayAllocs.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-300 shrink-0" />
                        <span className="text-blue-700 font-medium">{Number(a.plannedHours).toFixed(1)}h</span>
                        <span className="text-gray-600 truncate">{a.project.name}</span>
                        {a.notes && <span className="text-gray-400 truncate">— {a.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dayEntries.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1.5">Logged</p>
                  <div className="space-y-1">
                    {dayEntries.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <span className="text-blue-700 font-medium font-mono">{Number(e.hours).toFixed(1)}h</span>
                        <span className="text-gray-600 truncate">{e.description ?? "No description"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dayAllocs.length === 0 && dayEntries.length === 0 && (
                <p className="text-xs text-gray-400">Nothing planned or logged for this day.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
