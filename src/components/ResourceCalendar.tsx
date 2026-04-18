"use client"

import { useState, useEffect, useCallback } from "react"

const COLORS = [
  { bg: "#dbeafe", solid: "#2563eb", text: "#1e40af" }, // blue
  { bg: "#dcfce7", solid: "#16a34a", text: "#14532d" }, // green
  { bg: "#fce7f3", solid: "#db2777", text: "#831843" }, // pink
  { bg: "#fef9c3", solid: "#ca8a04", text: "#713f12" }, // yellow
  { bg: "#ede9fe", solid: "#7c3aed", text: "#4c1d95" }, // purple
  { bg: "#ffedd5", solid: "#ea580c", text: "#7c2d12" }, // orange
  { bg: "#cffafe", solid: "#0891b2", text: "#164e63" }, // cyan
  { bg: "#fef2f2", solid: "#dc2626", text: "#7f1d1d" }, // red
]

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

interface Allocation {
  id: string
  userId: string
  date: string
  plannedHours: number | string
  notes: string | null
  user: { id: string; name: string; email: string }
}

interface Member {
  id: string
  name: string
}

interface Props {
  projectId: string
  canManage: boolean
}

function toDateKey(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0] ?? "").join("").slice(0, 2).toUpperCase()
}

export default function ResourceCalendar({ projectId, canManage }: Props) {
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  const [allocations, setAllocations] = useState<Allocation[]>([])
  const [members, setMembers]         = useState<Member[]>([])
  const [loading, setLoading]         = useState(false)

  // Modal
  const [modalDate,    setModalDate]    = useState<string | null>(null)
  const [editAlloc,    setEditAlloc]    = useState<Allocation | null>(null)
  const [selUserId,    setSelUserId]    = useState("")
  const [selHours,     setSelHours]     = useState("8")
  const [selNotes,     setSelNotes]     = useState("")
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError,   setModalError]   = useState("")
  const [confirmDel,   setConfirmDel]   = useState(false)

  const monthStart = new Date(year, month, 1)
  const monthEnd   = new Date(year, month + 1, 0)
  const daysInMonth  = monthEnd.getDate()
  const firstWeekday = (monthStart.getDay() || 7) - 1 // 0=Mon

  const loadAllocations = useCallback(async () => {
    setLoading(true)
    try {
      const from = toDateKey(year, month, 1)
      const to   = toDateKey(year, month, daysInMonth)
      const res  = await fetch(
        `/api/projects/${projectId}/allocations?dateFrom=${from}T00:00:00.000Z&dateTo=${to}T23:59:59.999Z`
      )
      if (res.ok) setAllocations(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }, [projectId, year, month, daysInMonth])

  useEffect(() => { loadAllocations() }, [loadAllocations])

  useEffect(() => {
    fetch(`/api/projects/${projectId}/members`)
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setMembers(d) })
      .catch(() => {})
  }, [projectId])

  // Build colour map from unique users (members list primary, fallback allocations)
  const uniqueIds = Array.from(
    new Set([...members.map((m) => m.id), ...allocations.map((a) => a.userId)])
  )
  const colorMap: Record<string, number> = {}
  uniqueIds.forEach((id, i) => { colorMap[id] = i % COLORS.length })

  // Group allocations by date key
  const byDate: Record<string, Allocation[]> = {}
  allocations.forEach((a) => {
    const k = a.date.slice(0, 10)
    if (!byDate[k]) byDate[k] = []
    byDate[k]!.push(a)
  })

  const todayKey = toDateKey(now.getFullYear(), now.getMonth(), now.getDate())
  const monthLabel = monthStart.toLocaleDateString("en-GB", { month: "long", year: "numeric" })

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setYear((y) => y + 1); setMonth(0) }
    else setMonth((m) => m + 1)
  }

  function openAdd(dateKey: string) {
    if (!canManage) return
    const defaultUser = members[0]?.id ?? ""
    setModalDate(dateKey)
    setEditAlloc(null)
    setSelUserId(defaultUser)
    setSelHours("8")
    setSelNotes("")
    setModalError("")
    setConfirmDel(false)
  }

  function openEdit(alloc: Allocation, e: React.MouseEvent) {
    e.stopPropagation()
    if (!canManage) return
    setModalDate(alloc.date.slice(0, 10))
    setEditAlloc(alloc)
    setSelUserId(alloc.userId)
    setSelHours(String(Number(alloc.plannedHours)))
    setSelNotes(alloc.notes ?? "")
    setModalError("")
    setConfirmDel(false)
  }

  function closeModal() {
    setModalDate(null)
    setEditAlloc(null)
    setConfirmDel(false)
  }

  async function handleSave() {
    if (!modalDate || !selUserId) return
    const hours = parseFloat(selHours)
    if (!hours || hours <= 0) { setModalError("Enter valid hours."); return }
    setModalLoading(true); setModalError("")
    try {
      const res = await fetch(`/api/projects/${projectId}/allocations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId:       editAlloc ? editAlloc.userId : selUserId,
          date:         `${modalDate}T00:00:00.000Z`,
          plannedHours: hours,
          notes:        selNotes.trim() || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setModalError(d.error ?? "Failed to save.")
      } else {
        closeModal()
        loadAllocations()
      }
    } catch { setModalError("Network error.") }
    setModalLoading(false)
  }

  async function handleDelete() {
    if (!editAlloc) return
    try {
      await fetch(`/api/projects/${projectId}/allocations/${editAlloc.id}`, { method: "DELETE" })
      closeModal()
      loadAllocations()
    } catch { /* ignore */ }
  }

  // Legend members = those with at least one allocation this month OR in project members
  const legendMembers = uniqueIds
    .map((id) => ({
      id,
      name: members.find((m) => m.id === id)?.name
        ?? allocations.find((a) => a.userId === id)?.user.name
        ?? id,
    }))
    .slice(0, 8)

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-base font-semibold text-gray-800">Resource Calendar</h2>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="btn btn-secondary px-2 py-1 text-sm">‹</button>
          <span className="text-sm font-medium text-gray-700 min-w-[148px] text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="btn btn-secondary px-2 py-1 text-sm">›</button>
          {loading && <span className="text-xs text-gray-400 ml-1">…</span>}
        </div>
      </div>

      {/* Legend */}
      {legendMembers.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
          {legendMembers.map((m) => {
            const c = COLORS[colorMap[m.id] ?? 0]!
            return (
              <span key={m.id} className="flex items-center gap-1.5 text-xs text-gray-600">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.solid }} />
                {m.name}
              </span>
            )
          })}
          <span className="flex items-center gap-1.5 text-xs text-gray-400 ml-2">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 shrink-0" />planned hours
          </span>
        </div>
      )}

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-gray-400">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstWeekday }).map((_, i) => (
          <div key={`e-${i}`} className="min-h-[72px]" />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day     = i + 1
          const dateKey = toDateKey(year, month, day)
          const isToday = dateKey === todayKey
          const slots   = byDate[dateKey] ?? []

          return (
            <div
              key={day}
              className={`min-h-[72px] rounded-lg border p-1 transition-colors ${
                canManage ? "cursor-pointer hover:bg-gray-50" : ""
              } ${isToday ? "border-blue-400 bg-blue-50" : "border-gray-100 bg-white"}`}
              onClick={() => openAdd(dateKey)}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-[11px] font-medium leading-none ${isToday ? "text-blue-600" : "text-gray-400"}`}>
                  {day}
                </span>
                {canManage && slots.length === 0 && (
                  <span className="text-[10px] text-gray-200 leading-none">+</span>
                )}
              </div>
              <div className="space-y-0.5">
                {slots.map((a) => {
                  const c = COLORS[colorMap[a.userId] ?? 0]!
                  return (
                    <button
                      key={a.id}
                      className="w-full flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight hover:opacity-75 text-left"
                      style={{ backgroundColor: c.bg, color: c.text, borderLeft: `2px solid ${c.solid}` }}
                      onClick={(e) => openEdit(a, e)}
                      title={`${a.user.name} — ${Number(a.plannedHours).toFixed(1)}h${a.notes ? `\n${a.notes}` : ""}`}
                    >
                      <span className="font-semibold shrink-0">{initials(a.user.name)}</span>
                      <span className="font-mono shrink-0">{Number(a.plannedHours).toFixed(1)}h</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {canManage && (
        <p className="text-xs text-gray-400 mt-3">Click a day to add an allocation.</p>
      )}

      {/* Modal */}
      {modalDate && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-box p-6 max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 mb-1">
              {editAlloc ? "Edit allocation" : "Add allocation"}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {new Date(modalDate + "T12:00:00").toLocaleDateString("en-GB", {
                weekday: "long", day: "numeric", month: "long",
              })}
            </p>

            <div className="space-y-3">
              <div>
                <label className="label">Team member</label>
                <select
                  className="input"
                  value={selUserId}
                  onChange={(e) => setSelUserId(e.target.value)}
                  disabled={!!editAlloc}
                >
                  {(members.length > 0 ? members : legendMembers).map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                  {members.length === 0 && legendMembers.length === 0 && (
                    <option value="">No members found</option>
                  )}
                </select>
                {members.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">Assign team members to this project first.</p>
                )}
              </div>

              <div>
                <label className="label">Planned hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  className="input"
                  value={selHours}
                  onChange={(e) => setSelHours(e.target.value)}
                />
              </div>

              <div>
                <label className="label">Notes (optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. On-site, sprint planning"
                  value={selNotes}
                  onChange={(e) => setSelNotes(e.target.value)}
                />
              </div>
            </div>

            {modalError && <p className="text-sm text-red-600 mt-3">{modalError}</p>}

            <div className="flex flex-wrap items-center gap-2 mt-5">
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={modalLoading || !selUserId}
              >
                {modalLoading ? "Saving…" : editAlloc ? "Update" : "Add"}
              </button>
              <button className="btn btn-secondary" onClick={closeModal}>Cancel</button>

              {editAlloc && (
                <div className="ml-auto">
                  {confirmDel ? (
                    <div className="flex gap-2">
                      <button className="btn btn-danger text-xs" onClick={handleDelete}>Confirm delete</button>
                      <button className="btn btn-secondary text-xs" onClick={() => setConfirmDel(false)}>No</button>
                    </div>
                  ) : (
                    <button
                      className="btn text-xs text-red-600 border border-red-200 hover:bg-red-50"
                      onClick={() => setConfirmDel(true)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
