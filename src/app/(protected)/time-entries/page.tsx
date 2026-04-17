"use client"

import { useEffect, useState, useRef, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Client { id: string; name: string; reference: string | null; defaultRate: string | null }
interface Project { id: string; name: string; clientId: string; active: boolean; rateOverride: string | null; client: { id: string; name: string } }
interface Phase { id: string; name: string; projectId: string }
interface PurchaseOrder {
  id: string
  poNumber: string
  sowReference: string | null
  status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "COMPLETED"
  expiryDate: string | null
  value: string | null
  currency: string
}
interface Category { id: string; name: string; colour: string; isBillable: boolean }
interface TimeEntry {
  id: string; date: string; hours: string | number; description: string
  isBillable: boolean; status: string; timesheetId: string | null
  clientId: string | null; projectId: string | null; phaseId: string | null; categoryId: string | null
  client: { id: string; name: string; defaultRate: string | null } | null
  project: { id: string; name: string; rateOverride: string | null } | null
  phase: { id: string; name: string } | null
  category: { id: string; name: string; colour: string } | null
}
interface TimerState { startTime: string; clientId: string; projectId: string; phaseId: string; categoryId: string; description: string; isBillable: boolean }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TIMER_KEY = "timer_state"
const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-GB")
const fmtDate = (d: Date) => d.toISOString().split("T")[0]
const today = () => fmtDate(new Date())

function groupByDate(entries: TimeEntry[]): [string, TimeEntry[]][] {
  const map: Record<string, TimeEntry[]> = {}
  for (const e of entries) {
    const key = e.date.split("T")[0]
    if (!map[key]) map[key] = []
    map[key].push(e)
  }
  return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]))
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`
}

function roundToNearest15(minutes: number): number {
  return Math.max(0.25, Math.round(minutes / 15) * 15 / 60)
}

function downloadCsv(entries: TimeEntry[], filename: string) {
  const rows = [
    ["Date","Client","Project","Phase","Category","Hours","Billable","Description","Status","Rate","Value"]
  ]
  for (const e of entries) {
    const rate  = Number(e.project?.rateOverride ?? e.client?.defaultRate ?? 0)
    const hours = Number(e.hours)
    const value = e.isBillable ? hours * rate : 0
    rows.push([
      fmt(e.date), e.client?.name ?? "", e.project?.name ?? "", e.phase?.name ?? "",
      e.category?.name ?? "", hours.toFixed(2), e.isBillable ? "Yes" : "No",
      `"${(e.description ?? "").replace(/"/g, '""')}"`, e.status,
      rate.toFixed(2), value.toFixed(2),
    ])
  }
  const csv = rows.map(r => r.join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function statusClass(s: string) {
  return s === "DRAFT" ? "badge-draft" : s === "SUBMITTED" ? "badge-submitted" : s === "APPROVED" ? "badge-approved" : s === "REJECTED" ? "badge-rejected" : "badge-draft"
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
function TimeEntriesContent() {
  // Data
  const [clients, setClients]     = useState<Client[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [entries, setEntries]     = useState<TimeEntry[]>([])
  const [loading, setLoading]     = useState(true)

  // Quick entry form
  const [fDate,        setFDate]       = useState(today())
  const [fClientId,    setFClientId]   = useState("")
  const [fProjectId,   setFProjectId]  = useState("")
  const [fPhaseId,     setFPhaseId]    = useState("")
  const [fCategoryId,  setFCategoryId] = useState("")
  const [fPoId,        setFPoId]       = useState("")
  const [fHours,       setFHours]      = useState("1.00")
  const [fDesc,        setFDesc]       = useState("")
  const [fBillable,    setFBillable]   = useState(true)
  const [fSaving,      setFSaving]     = useState(false)
  const [fError,       setFError]      = useState("")
  const [clientProjects, setClientProjects] = useState<Project[]>([])
  const [phases,          setPhases]        = useState<Phase[]>([])
  const [projectPos,      setProjectPos]    = useState<PurchaseOrder[]>([])

  // Filters
  const [filterClient,   setFilterClient]   = useState("")
  const [filterProject,  setFilterProject]  = useState("")
  const [filterCategory, setFilterCategory] = useState("")
  const [filterStatus,   setFilterStatus]   = useState("")
  const [filterBillable, setFilterBillable] = useState("")
  const [filterFrom,     setFilterFrom]     = useState("")
  const [filterTo,       setFilterTo]       = useState("")

  // Timer
  const [timerRunning, setTimerRunning] = useState(false)
  const [elapsed,      setElapsed]      = useState("00:00:00")
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Edit
  const [editId,   setEditId]   = useState<string | null>(null)
  const [editData, setEditData] = useState<Partial<TimeEntry & { date: string; hours: string }>>({})
  const [editProjects, setEditProjects] = useState<Project[]>([])
  const [editPhases,   setEditPhases]   = useState<Phase[]>([])
  const [editSaving,   setEditSaving]   = useState(false)

  // Bundle modal
  const [showBundle, setShowBundle]     = useState(false)
  const [bundleClientId, setBundleClientId] = useState("")
  const [bundleGranularity, setBundleGranularity] = useState<"WEEKLY" | "MONTHLY">("WEEKLY")
  const [bundleFrom, setBundleFrom]     = useState("")
  const [bundleTo,   setBundleTo]       = useState("")
  const [bundleMonth, setBundleMonth]   = useState(new Date().getMonth() + 1)
  const [bundleYear,  setBundleYear]    = useState(new Date().getFullYear())
  const [bundleSaving, setBundleSaving] = useState(false)
  const [bundleError,  setBundleError]  = useState("")

  // ---------------------------------------------------------------------------
  // Timer logic
  // ---------------------------------------------------------------------------
  const tickTimer = useCallback(() => {
    const raw = localStorage.getItem(TIMER_KEY)
    if (!raw) { setTimerRunning(false); setElapsed("00:00:00"); return }
    try {
      const ts: TimerState = JSON.parse(raw)
      const ms = Date.now() - new Date(ts.startTime).getTime()
      setElapsed(formatElapsed(ms))
      setTimerRunning(true)
    } catch { setTimerRunning(false) }
  }, [])

  useEffect(() => {
    tickTimer()
    timerRef.current = setInterval(tickTimer, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [tickTimer])

  function startTimer() {
    const state: TimerState = { startTime: new Date().toISOString(), clientId: fClientId, projectId: fProjectId, phaseId: fPhaseId, categoryId: fCategoryId, description: fDesc, isBillable: fBillable }
    localStorage.setItem(TIMER_KEY, JSON.stringify(state))
    setTimerRunning(true)
  }

  function stopTimer() {
    const raw = localStorage.getItem(TIMER_KEY)
    if (!raw) return
    try {
      const ts: TimerState = JSON.parse(raw)
      const ms = Date.now() - new Date(ts.startTime).getTime()
      const mins = ms / 60000
      const rounded = roundToNearest15(mins)
      setFHours(rounded.toFixed(2))
      if (ts.clientId) { setFClientId(ts.clientId) }
      if (ts.projectId) setFProjectId(ts.projectId)
      if (ts.phaseId) setFPhaseId(ts.phaseId)
      if (ts.categoryId) setFCategoryId(ts.categoryId)
      if (ts.description) setFDesc(ts.description)
      setFBillable(ts.isBillable)
    } catch {}
    localStorage.removeItem(TIMER_KEY)
    setTimerRunning(false)
    setElapsed("00:00:00")
  }

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------
  const loadEntries = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterClient)   params.set("clientId",   filterClient)
    if (filterProject)  params.set("projectId",  filterProject)
    if (filterCategory) params.set("categoryId", filterCategory)
    if (filterStatus)   params.set("status",     filterStatus)
    if (filterBillable) params.set("isBillable", filterBillable)
    if (filterFrom)     params.set("dateFrom",   new Date(filterFrom).toISOString())
    if (filterTo)       params.set("dateTo",     new Date(filterTo + "T23:59:59").toISOString())
    const res = await fetch(`/api/time-entries?${params}`)
    if (res.ok) setEntries(await res.json())
    setLoading(false)
  }, [filterClient, filterProject, filterCategory, filterStatus, filterBillable, filterFrom, filterTo])

  useEffect(() => {
    Promise.all([
      fetch("/api/clients").then(r => r.json()),
      fetch("/api/categories").then(r => r.json()),
    ]).then(([c, cat]) => {
      setClients(c)
      setCategories(cat)
    })
    loadEntries()
  }, [loadEntries])

  // Load projects when form client changes
  useEffect(() => {
    if (!fClientId) { setClientProjects([]); setFProjectId(""); return }
    fetch(`/api/projects?clientId=${fClientId}&active=true`).then(r => r.json()).then(setClientProjects)
    setFProjectId(""); setFPhaseId("")
  }, [fClientId])

  // Load phases when form project changes
  useEffect(() => {
    if (!fProjectId) { setPhases([]); setFPhaseId(""); return }
    fetch(`/api/projects/${fProjectId}/phases`).then(r => r.json()).then(setPhases)
    setFPhaseId("")
  }, [fProjectId])

  // Load purchase orders when form project changes
  useEffect(() => {
    if (!fProjectId) { setProjectPos([]); setFPoId(""); return }
    fetch(`/api/projects/${fProjectId}/purchase-orders`)
      .then(r => r.ok ? r.json() : [])
      .then((data) => setProjectPos(Array.isArray(data) ? data : []))
      .catch(() => setProjectPos([]))
    setFPoId("")
  }, [fProjectId])

  // ---------------------------------------------------------------------------
  // Edit project/phase loading
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!editData.clientId) { setEditProjects([]); return }
    fetch(`/api/projects?clientId=${editData.clientId}&active=true`).then(r => r.json()).then(setEditProjects)
  }, [editData.clientId])

  useEffect(() => {
    if (!editData.projectId) { setEditPhases([]); return }
    fetch(`/api/projects/${editData.projectId}/phases`).then(r => r.json()).then(setEditPhases)
  }, [editData.projectId])

  // ---------------------------------------------------------------------------
  // Create entry
  // ---------------------------------------------------------------------------
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFSaving(true); setFError("")
    const res = await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: new Date(fDate).toISOString(),
        clientId: fClientId,
        projectId: fProjectId || null,
        phaseId: fPhaseId || null,
        categoryId: fCategoryId || null,
        purchaseOrderId: fPoId || null,
        hours: parseFloat(fHours),
        description: fDesc,
        isBillable: fBillable,
      }),
    })
    if (res.ok) {
      setFDesc(""); setFHours("1.00"); setFPhaseId(""); setFPoId("")
      await loadEntries()
    } else {
      const d = await res.json()
      setFError(d.error ?? "Failed to create entry")
    }
    setFSaving(false)
  }

  // ---------------------------------------------------------------------------
  // Edit entry
  // ---------------------------------------------------------------------------
  function openEdit(entry: TimeEntry) {
    setEditId(entry.id)
    setEditData({
      date: entry.date.split("T")[0],
      clientId: entry.clientId ?? "",
      projectId: entry.projectId ?? "",
      phaseId: entry.phaseId ?? "",
      categoryId: entry.categoryId ?? "",
      hours: String(entry.hours),
      description: entry.description,
      isBillable: entry.isBillable,
    })
  }

  async function saveEdit() {
    if (!editId) return
    setEditSaving(true)
    const res = await fetch(`/api/time-entries/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: editData.date ? new Date(editData.date).toISOString() : undefined,
        projectId: editData.projectId || null,
        phaseId: editData.phaseId || null,
        categoryId: editData.categoryId || null,
        hours: editData.hours ? parseFloat(editData.hours) : undefined,
        description: editData.description,
        isBillable: editData.isBillable,
      }),
    })
    if (res.ok) { setEditId(null); await loadEntries() }
    setEditSaving(false)
  }

  async function deleteEntry(id: string) {
    if (!confirm("Delete this time entry?")) return
    await fetch(`/api/time-entries/${id}`, { method: "DELETE" })
    await loadEntries()
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------
  const selectableEntries = entries.filter(e => !e.timesheetId && e.status === "DRAFT")
  const allSelected = selectableEntries.length > 0 && selectableEntries.every(e => selected.has(e.id))

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(selectableEntries.map(e => e.id)))
  }

  function toggleOne(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // ---------------------------------------------------------------------------
  // Bundle modal
  // ---------------------------------------------------------------------------
  function openBundle() {
    const sel = entries.filter(e => selected.has(e.id))
    if (!sel.length) return
    const clientId = sel[0].clientId ?? ""
    setBundleClientId(clientId)
    const dates = sel.map(e => new Date(e.date)).sort((a, b) => a.getTime() - b.getTime())
    // Default to the week of the earliest selected entry
    const earliest = dates[0]
    const day = earliest.getDay()
    const diff = day === 0 ? -6 : 1 - day
    const mon = new Date(earliest); mon.setDate(earliest.getDate() + diff)
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
    setBundleFrom(fmtDate(mon))
    setBundleTo(fmtDate(sun))
    setBundleMonth(earliest.getMonth() + 1)
    setBundleYear(earliest.getFullYear())
    setShowBundle(true)
  }

  async function submitBundle() {
    setBundleSaving(true); setBundleError("")
    let periodStart: string, periodEnd: string
    if (bundleGranularity === "WEEKLY") {
      periodStart = new Date(bundleFrom).toISOString()
      periodEnd   = new Date(bundleTo + "T23:59:59").toISOString()
    } else {
      const s = new Date(bundleYear, bundleMonth - 1, 1)
      const en = new Date(bundleYear, bundleMonth, 0, 23, 59, 59)
      periodStart = s.toISOString(); periodEnd = en.toISOString()
    }
    const res = await fetch("/api/timesheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: bundleClientId, periodStart, periodEnd, granularity: bundleGranularity, entryIds: Array.from(selected) }),
    })
    if (res.ok) {
      setShowBundle(false); setSelected(new Set()); await loadEntries()
    } else {
      const d = await res.json(); setBundleError(d.error ?? "Failed to create timesheet")
    }
    setBundleSaving(false)
  }

  // ---------------------------------------------------------------------------
  // CSV download
  // ---------------------------------------------------------------------------
  function downloadAll() {
    downloadCsv(entries, `time-entries-${today()}.csv`)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const grouped = groupByDate(entries)
  const selEntries = entries.filter(e => selected.has(e.id))
  const selHours = selEntries.reduce((s, e) => s + Number(e.hours), 0)
  const selBillable = selEntries.filter(e => e.isBillable).reduce((s, e) => s + Number(e.hours), 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time Entries</h1>
          <p className="text-sm text-gray-500 mt-1">Log and manage your time</p>
        </div>
        <div className="flex gap-2">
          {timerRunning ? (
            <div className="flex items-center gap-3 card px-4 py-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="font-mono text-sm text-gray-800">{elapsed}</span>
              <button onClick={stopTimer} className="btn-danger btn text-xs px-3 py-1">Stop & log</button>
            </div>
          ) : (
            <button onClick={startTimer} disabled={!fClientId} className="btn-primary btn text-sm" title={!fClientId ? "Select a client first" : "Start timer"}>
              ▶ Start Timer
            </button>
          )}
          <button onClick={downloadAll} className="btn-secondary btn text-sm">⬇ CSV</button>
        </div>
      </div>

      {/* Quick entry form */}
      <div className="card p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Entry</h2>
        <form onSubmit={handleCreate} className="space-y-3">
          {fError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{fError}</p>}
          {fProjectId && projectPos.length === 0 && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              No purchase orders recorded for this project. Time can still be logged — notify your manager to add a PO.
            </p>
          )}
          {(() => {
            const po = projectPos.find(p => p.id === fPoId)
            if (!po) return null
            if (po.status === "EXPIRED" || po.status === "CANCELLED") {
              return (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
                  Selected PO is {po.status.toLowerCase()}. New time cannot be allocated against it.
                </p>
              )
            }
            if (po.expiryDate) {
              const days = Math.floor((new Date(po.expiryDate).getTime() - Date.now()) / 86_400_000)
              if (days < 0) {
                return (
                  <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
                    Warning: Purchase Order {po.poNumber} expired {Math.abs(days)} day(s) ago.
                  </p>
                )
              }
              if (days <= 30) {
                return (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    Purchase Order {po.poNumber} expires in {days} day(s).
                  </p>
                )
              }
            }
            return null
          })()}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" required value={fDate} onChange={e => setFDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Client *</label>
              <select className="input" required value={fClientId} onChange={e => setFClientId(e.target.value)}>
                <option value="">Select…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Project</label>
              <select className="input" value={fProjectId} onChange={e => setFProjectId(e.target.value)} disabled={!fClientId}>
                <option value="">{!fClientId ? "Select client first" : "No project"}</option>
                {clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {phases.length > 0 && (
              <div>
                <label className="label">Phase</label>
                <select className="input" value={fPhaseId} onChange={e => setFPhaseId(e.target.value)}>
                  <option value="">No phase</option>
                  {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            {fProjectId && projectPos.length > 0 && (
              <div>
                <label className="label">Purchase Order</label>
                <select className="input" value={fPoId} onChange={e => setFPoId(e.target.value)}>
                  <option value="">No PO</option>
                  {projectPos.map(po => (
                    <option key={po.id} value={po.id} disabled={po.status !== "ACTIVE"}>
                      {po.poNumber}{po.sowReference ? ` / ${po.sowReference}` : ""}{po.status !== "ACTIVE" ? ` (${po.status})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="label">Category</label>
              <select className="input" value={fCategoryId} onChange={e => { setFCategoryId(e.target.value); const cat = categories.find(c => c.id === e.target.value); if (cat) setFBillable(cat.isBillable) }}>
                <option value="">None</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Hours *</label>
              <input type="number" className="input" required step="0.25" min="0.25" max="24" value={fHours} onChange={e => setFHours(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Description *</label>
              <input type="text" className="input" required maxLength={1000} placeholder="What did you work on?" value={fDesc} onChange={e => setFDesc(e.target.value)} />
            </div>
            <div className="flex flex-col justify-end gap-1">
              <label className="flex items-center gap-2 cursor-pointer mt-5">
                <input type="checkbox" className="w-4 h-4 rounded" checked={fBillable} onChange={e => setFBillable(e.target.checked)} />
                <span className="text-sm text-gray-700">Billable</span>
              </label>
            </div>
            <div className="flex flex-col justify-end">
              <button type="submit" disabled={fSaving} className="btn-primary btn">{fSaving ? "Saving…" : "Add Entry"}</button>
            </div>
          </div>
        </form>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Client</label>
            <select className="input text-sm py-1.5" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
              <option value="">All clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input text-sm py-1.5" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">All</option>
              {["DRAFT","SUBMITTED","APPROVED","REJECTED"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input text-sm py-1.5" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
              <option value="">All</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Billable</label>
            <select className="input text-sm py-1.5" value={filterBillable} onChange={e => setFilterBillable(e.target.value)}>
              <option value="">All</option>
              <option value="true">Billable</option>
              <option value="false">Non-billable</option>
            </select>
          </div>
          <div>
            <label className="label">From</label>
            <input type="date" className="input text-sm py-1.5" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input text-sm py-1.5" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
          {(filterClient || filterStatus || filterCategory || filterBillable || filterFrom || filterTo) && (
            <button onClick={() => { setFilterClient(""); setFilterStatus(""); setFilterCategory(""); setFilterBillable(""); setFilterFrom(""); setFilterTo("") }} className="btn-secondary btn text-sm py-1.5">Clear</button>
          )}
        </div>
      </div>

      {/* Selection actions bar */}
      {selected.size > 0 && (
        <div className="card p-3 mb-4 flex items-center justify-between bg-blue-50 border-blue-200">
          <span className="text-sm text-blue-800 font-medium">{selected.size} selected · {selHours.toFixed(2)}h total · {selBillable.toFixed(2)}h billable</span>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="btn-secondary btn text-sm py-1">Deselect all</button>
            <button onClick={openBundle} className="btn-primary btn text-sm py-1">Create Timesheet →</button>
          </div>
        </div>
      )}

      {/* Entries list */}
      {loading ? (
        <div className="card p-8 text-center text-sm text-gray-400">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-400">No entries found. Add one above.</div>
      ) : (
        <div className="space-y-4">
          {/* Select-all row */}
          {selectableEntries.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 rounded" />
              <span className="text-xs text-gray-500">Select all unsubmitted ({selectableEntries.length})</span>
            </div>
          )}
          {grouped.map(([date, dayEntries]) => (
            <div key={date} className="card overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">
                  {new Date(date).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })}
                </span>
                <span className="text-xs text-gray-400">{dayEntries.reduce((s, e) => s + Number(e.hours), 0).toFixed(2)}h</span>
              </div>
              {dayEntries.map(entry => (
                <div key={entry.id}>
                  {editId === entry.id ? (
                    /* Inline edit */
                    <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                        <input type="date" className="input text-sm" value={editData.date ?? ""} onChange={e => setEditData(d => ({...d, date: e.target.value}))} />
                        <select className="input text-sm" value={editData.projectId ?? ""} onChange={e => setEditData(d => ({...d, projectId: e.target.value}))}>
                          <option value="">No project</option>
                          {editProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {editPhases.length > 0 && (
                          <select className="input text-sm" value={editData.phaseId ?? ""} onChange={e => setEditData(d => ({...d, phaseId: e.target.value}))}>
                            <option value="">No phase</option>
                            {editPhases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        )}
                        <select className="input text-sm" value={editData.categoryId ?? ""} onChange={e => setEditData(d => ({...d, categoryId: e.target.value}))}>
                          <option value="">No category</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <input type="number" className="input text-sm" step="0.25" min="0.25" max="24" value={editData.hours ?? ""} onChange={e => setEditData(d => ({...d, hours: e.target.value}))} />
                        <input type="text" className="input text-sm col-span-2" value={editData.description ?? ""} onChange={e => setEditData(d => ({...d, description: e.target.value}))} />
                        <label className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={editData.isBillable ?? true} onChange={e => setEditData(d => ({...d, isBillable: e.target.checked}))} />
                          Billable
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={saveEdit} disabled={editSaving} className="btn-primary btn text-sm py-1">{editSaving ? "Saving…" : "Save"}</button>
                        <button onClick={() => setEditId(null)} className="btn-secondary btn text-sm py-1">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3 hover:bg-gray-50">
                      {!entry.timesheetId && entry.status === "DRAFT" ? (
                        <input type="checkbox" checked={selected.has(entry.id)} onChange={() => toggleOne(entry.id)} className="w-4 h-4 rounded flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                          <span className="text-gray-300 text-xs">🔒</span>
                        </div>
                      )}
                      {entry.category && (
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.category.colour }} title={entry.category.name} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 truncate">{entry.description}</span>
                          {!entry.isBillable && <span className="text-xs text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">Non-billable</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                          <span>{entry.client?.name ?? "—"}</span>
                          {entry.project && <><span>·</span><span>{entry.project.name}</span></>}
                          {entry.phase && <><span>·</span><span>{entry.phase.name}</span></>}
                          {entry.timesheetId && <><span>·</span><span className="text-blue-400">In timesheet</span></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className="text-sm font-medium text-gray-700">{Number(entry.hours).toFixed(2)}h</span>
                        <span className={`badge ${statusClass(entry.status)}`}>{entry.status}</span>
                        {entry.status === "DRAFT" && !entry.timesheetId && (
                          <>
                            <button onClick={() => openEdit(entry)} className="text-xs text-blue-600 hover:underline">Edit</button>
                            <button onClick={() => deleteEntry(entry.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Bundle modal */}
      {showBundle && (
        <div className="modal-backdrop" onClick={() => setShowBundle(false)}>
          <div className="modal-box max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Create Timesheet Bundle</h2>
            </div>
            <div className="px-6 py-4 space-y-4">
              {bundleError && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{bundleError}</p>}
              <div>
                <label className="label">Client</label>
                <select className="input" value={bundleClientId} onChange={e => setBundleClientId(e.target.value)}>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Granularity</label>
                <div className="flex gap-2">
                  {(["WEEKLY","MONTHLY"] as const).map(g => (
                    <button key={g} onClick={() => setBundleGranularity(g)} className={`btn text-sm ${bundleGranularity === g ? "btn-primary" : "btn-secondary"}`}>{g === "WEEKLY" ? "Weekly" : "Monthly"}</button>
                  ))}
                </div>
              </div>
              {bundleGranularity === "WEEKLY" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Week start (Mon)</label><input type="date" className="input" value={bundleFrom} onChange={e => setBundleFrom(e.target.value)} /></div>
                  <div><label className="label">Week end (Sun)</label><input type="date" className="input" value={bundleTo} onChange={e => setBundleTo(e.target.value)} /></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Month</label>
                    <select className="input" value={bundleMonth} onChange={e => setBundleMonth(Number(e.target.value))}>
                      {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Year</label>
                    <input type="number" className="input" value={bundleYear} onChange={e => setBundleYear(Number(e.target.value))} min="2020" max="2040" />
                  </div>
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Selected entries</span><span className="font-medium">{selected.size}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Total hours</span><span className="font-medium">{selHours.toFixed(2)}h</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Billable</span><span className="font-medium text-green-700">{selBillable.toFixed(2)}h</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Non-billable</span><span className="font-medium text-gray-500">{(selHours - selBillable).toFixed(2)}h</span></div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button onClick={() => setShowBundle(false)} className="btn-secondary btn">Cancel</button>
              <button onClick={submitBundle} disabled={bundleSaving || !bundleClientId} className="btn-primary btn">{bundleSaving ? "Creating…" : "Create Timesheet"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TimeEntriesPage() {
  return <Suspense fallback={<div className="p-6 text-sm text-gray-400">Loading…</div>}><TimeEntriesContent /></Suspense>
}
