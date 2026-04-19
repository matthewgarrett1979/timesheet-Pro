"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

// ─────────────────────────────────────────────────────────────
// Timesheet types
// ─────────────────────────────────────────────────────────────
interface TimesheetEntry {
  id: string
  date: string
  hours: string | number
  description: string
  isBillable: boolean
  status: string
  project: { id: string; name: string } | null
  phase: { id: string; name: string } | null
  category: { id: string; name: string; colour: string } | null
}

interface Timesheet {
  id: string
  periodStart: string
  periodEnd: string
  granularity: string
  status: string
  rejectionNote: string | null
  submittedAt: string | null
  approvedAt: string | null
  approvedBy: string | null
  client: { id: string; name: string; reference: string | null }
  entries: TimesheetEntry[]
}

// ─────────────────────────────────────────────────────────────
// Expense types
// ─────────────────────────────────────────────────────────────
interface Expense {
  id: string
  description: string
  amount: string
  currency: string
  date: string
  category: string
  status: string
  billable: boolean
  rejectionNote: string | null
  submittedAt: string | null
  approvedAt: string | null
  client: { id: string; name: string } | null
  manager: { id: string; name: string }
}

// ─────────────────────────────────────────────────────────────
// Shared
// ─────────────────────────────────────────────────────────────
const TS_STATUS_CLASSES: Record<string, string> = {
  DRAFT:              "badge-draft",
  SUBMITTED:          "badge-submitted",
  PARTIALLY_APPROVED: "badge-submitted",
  APPROVED:           "badge-approved",
  REJECTED:           "badge-rejected",
  INVOICED:           "badge-invoiced",
}

const EX_STATUS_CLASSES: Record<string, string> = {
  DRAFT:     "badge-draft",
  SUBMITTED: "badge-submitted",
  APPROVED:  "badge-approved",
  REJECTED:  "badge-rejected",
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-GB")
}

function sumHours(entries: TimesheetEntry[]) {
  return entries.reduce((acc, e) => acc + Number(e.hours), 0)
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function ApprovalsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "ADMIN"

  const [section, setSection] = useState<"timesheets" | "expenses">("timesheets")

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Approvals</h1>
      </div>

      {/* Section tabs */}
      <div className="flex gap-0 mb-6 border-b border-gray-200">
        {(["timesheets", "expenses"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              section === s
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {section === "timesheets" ? (
        <TimesheetsApprovals isAdmin={isAdmin} />
      ) : (
        <ExpensesApprovals isAdmin={isAdmin} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Timesheets approvals (existing logic, extracted to component)
// ─────────────────────────────────────────────────────────────
function TimesheetsApprovals({ isAdmin }: { isAdmin: boolean }) {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"pending" | "approved">("pending")

  const [filterClientId, setFilterClientId] = useState("")
  const [filterDateFrom, setFilterDateFrom] = useState("")
  const [filterDateTo, setFilterDateTo] = useState("")

  const [selected, setSelected] = useState<Timesheet | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState("")
  const [actionSuccess, setActionSuccess] = useState("")

  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectionNote, setRejectionNote] = useState("")
  const [checkedEntries, setCheckedEntries] = useState<Record<string, boolean>>({})

  const [overrideAction, setOverrideAction] = useState<"FORCE_APPROVE" | "FORCE_REJECT" | "RESET_TO_DRAFT" | null>(null)
  const [overrideReason, setOverrideReason] = useState("")
  const [overrideError, setOverrideError] = useState("")

  async function load() {
    setLoading(true)
    try {
      const [submitted, partial, approved] = await Promise.all([
        fetch("/api/timesheets?status=SUBMITTED").then((r) => r.json()),
        fetch("/api/timesheets?status=PARTIALLY_APPROVED").then((r) => r.json()),
        fetch("/api/timesheets?status=APPROVED").then((r) => r.json()),
      ])
      const all = [
        ...(Array.isArray(submitted) ? submitted : []),
        ...(Array.isArray(partial) ? partial : []),
        ...(Array.isArray(approved) ? approved : []),
      ]
      setTimesheets(all)
    } catch {
      setTimesheets([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openModal(ts: Timesheet) {
    setSelected(ts)
    setActionError("")
    setActionSuccess("")
    setShowRejectForm(false)
    setRejectionNote("")
    setOverrideAction(null)
    setOverrideReason("")
    setOverrideError("")
    const init: Record<string, boolean> = {}
    ts.entries.forEach((e) => { init[e.id] = true })
    setCheckedEntries(init)
  }

  function closeModal() {
    setSelected(null)
    setActionError("")
    setActionSuccess("")
    setShowRejectForm(false)
    setRejectionNote("")
    setOverrideAction(null)
    setOverrideReason("")
    setOverrideError("")
  }

  async function handleApprove() {
    if (!selected) return
    setActionLoading(true)
    setActionError("")
    try {
      const res = await fetch(`/api/timesheets/${selected.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      })
      if (!res.ok) {
        const data = await res.json()
        setActionError(data.error ?? "Failed to approve.")
      } else {
        await load()
        closeModal()
      }
    } catch {
      setActionError("Network error.")
    }
    setActionLoading(false)
  }

  async function handleReject() {
    if (!selected) return
    if (!rejectionNote.trim()) { setActionError("A rejection note is required."); return }
    setActionLoading(true)
    setActionError("")
    try {
      const res = await fetch(`/api/timesheets/${selected.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", rejectionNote: rejectionNote.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setActionError(data.error ?? "Failed to reject.")
      } else {
        await load()
        closeModal()
      }
    } catch {
      setActionError("Network error.")
    }
    setActionLoading(false)
  }

  async function handlePartialApproval() {
    if (!selected) return
    const approvedEntryIds = selected.entries.filter((e) => checkedEntries[e.id]).map((e) => e.id)
    const rejectedEntryIds = selected.entries.filter((e) => !checkedEntries[e.id]).map((e) => e.id)
    setActionLoading(true)
    setActionError("")
    try {
      const res = await fetch(`/api/timesheets/${selected.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "PARTIAL", approvedEntryIds, rejectedEntryIds }),
      })
      if (!res.ok) {
        const data = await res.json()
        setActionError(data.error ?? "Failed to partially approve.")
      } else {
        await load()
        closeModal()
      }
    } catch {
      setActionError("Network error.")
    }
    setActionLoading(false)
  }

  async function handleOverride() {
    if (!selected || !overrideAction) return
    if (!overrideReason.trim()) { setOverrideError("A reason is required."); return }
    setActionLoading(true)
    setOverrideError("")
    try {
      const res = await fetch(`/api/timesheets/${selected.id}/force`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: overrideAction, reason: overrideReason.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setOverrideError(data.error ?? "Failed.")
      } else {
        await load()
        closeModal()
      }
    } catch {
      setOverrideError("Network error.")
    }
    setActionLoading(false)
  }

  async function handleResendApprovalEmail() {
    if (!selected) return
    setActionLoading(true)
    setActionError("")
    try {
      const res = await fetch(`/api/timesheets/${selected.id}/resend-approval`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        setActionError(data.error ?? "Failed to resend.")
      } else {
        setActionSuccess("Approval email resent successfully.")
      }
    } catch {
      setActionError("Network error.")
    }
    setActionLoading(false)
  }

  const allClients = Array.from(new Map(timesheets.map((ts) => [ts.client.id, ts.client])).values())

  function applyFilters(list: Timesheet[]) {
    return list.filter((ts) => {
      if (filterClientId && ts.client.id !== filterClientId) return false
      if (filterDateFrom && ts.periodStart < filterDateFrom) return false
      if (filterDateTo && ts.periodStart > filterDateTo) return false
      return true
    })
  }

  const pending = applyFilters(timesheets.filter((ts) => ts.status === "SUBMITTED" || ts.status === "PARTIALLY_APPROVED"))
  const approved = applyFilters(timesheets.filter((ts) => ts.status === "APPROVED"))
  const displayed = tab === "pending" ? pending : approved

  const approvedCount = selected ? selected.entries.filter((e) => checkedEntries[e.id]).length : 0
  const rejectedCount = selected ? selected.entries.filter((e) => !checkedEntries[e.id]).length : 0

  return (
    <>
      <p className="text-sm text-gray-500 -mt-4 mb-4">
        {pending.length} awaiting approval · {approved.length} approved
      </p>

      {/* Filters */}
      <div className="card p-4 mb-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="label">Client</label>
          <select className="input" value={filterClientId} onChange={(e) => setFilterClientId(e.target.value)}>
            <option value="">All clients</option>
            {allClients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Period from</label>
          <input type="date" className="input" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="label">Period to</label>
          <input type="date" className="input" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
        </div>
        <button className="btn btn-secondary" onClick={() => { setFilterClientId(""); setFilterDateFrom(""); setFilterDateTo("") }}>
          Clear
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 mb-4 border-b border-gray-200">
        {(["pending", "approved"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "pending" ? `Pending (${pending.length})` : "Approved"}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {tab === "pending" ? "No timesheets awaiting approval." : "No approved timesheets yet."}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Reference</th>
                <th>Period</th>
                <th>Hours</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((ts) => (
                <tr key={ts.id}>
                  <td className="font-medium text-gray-900">{ts.client.name}</td>
                  <td className="text-gray-500 font-mono text-xs">{ts.client.reference ?? "—"}</td>
                  <td>{formatDate(ts.periodStart)} – {formatDate(ts.periodEnd)}</td>
                  <td>{sumHours(ts.entries).toFixed(2)}</td>
                  <td className="text-gray-400">{ts.submittedAt ? formatDate(ts.submittedAt) : "—"}</td>
                  <td>
                    <span className={`badge ${TS_STATUS_CLASSES[ts.status] ?? "badge-draft"}`}>
                      {ts.status.replace("_", " ")}
                    </span>
                  </td>
                  <td>
                    <button className="btn btn-secondary text-xs py-1 px-2" onClick={() => openModal(ts)}>
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-box max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{selected.client.name}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {formatDate(selected.periodStart)} – {formatDate(selected.periodEnd)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${TS_STATUS_CLASSES[selected.status] ?? "badge-draft"}`}>
                  {selected.status.replace("_", " ")}
                </span>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl font-light">×</button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-6">
              {selected.rejectionNote && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm font-medium text-red-800 mb-1">Rejection note</p>
                  <p className="text-sm text-red-700">{selected.rejectionNote}</p>
                </div>
              )}
              {actionError && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm text-red-700">{actionError}</p>
                </div>
              )}
              {actionSuccess && (
                <div className="bg-green-50 border border-green-200 rounded p-3">
                  <p className="text-sm text-green-700">{actionSuccess}</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Time Entries</h3>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {isAdmin && <th className="w-8"></th>}
                        <th>Date</th>
                        <th>Project</th>
                        <th>Phase</th>
                        <th>Category</th>
                        <th>Hours</th>
                        <th>Billable</th>
                        <th>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.entries.map((entry) => (
                        <tr key={entry.id}>
                          {isAdmin && (
                            <td>
                              <input
                                type="checkbox"
                                checked={!!checkedEntries[entry.id]}
                                onChange={(e) => setCheckedEntries((prev) => ({ ...prev, [entry.id]: e.target.checked }))}
                              />
                            </td>
                          )}
                          <td>{formatDate(entry.date)}</td>
                          <td className="text-gray-700">{entry.project?.name ?? "—"}</td>
                          <td className="text-gray-500">{entry.phase?.name ?? "—"}</td>
                          <td>
                            {entry.category ? (
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.category.colour }} />
                                {entry.category.name}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="font-mono">{Number(entry.hours).toFixed(2)}</td>
                          <td>
                            <span className={`badge ${entry.isBillable ? "badge-approved" : "badge-draft"}`}>
                              {entry.isBillable ? "Yes" : "No"}
                            </span>
                          </td>
                          <td className="text-gray-500 max-w-xs truncate">{entry.description || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-sm text-gray-600 font-medium text-right">
                  Total: {sumHours(selected.entries).toFixed(2)} hrs
                </div>
              </div>

              {selected.status === "SUBMITTED" && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions</h3>
                  {!showRejectForm ? (
                    <div className="flex gap-3">
                      <button className="btn btn-primary" disabled={actionLoading} onClick={handleApprove}>
                        {actionLoading ? "Processing…" : "Approve"}
                      </button>
                      <button className="btn btn-danger" disabled={actionLoading} onClick={() => { setShowRejectForm(true); setActionError("") }}>
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="label">Rejection note (required)</label>
                        <textarea
                          className="input"
                          rows={3}
                          value={rejectionNote}
                          onChange={(e) => setRejectionNote(e.target.value)}
                          placeholder="Explain why this timesheet is being rejected…"
                        />
                      </div>
                      <div className="flex gap-3">
                        <button className="btn btn-danger" disabled={actionLoading || !rejectionNote.trim()} onClick={handleReject}>
                          {actionLoading ? "Rejecting…" : "Confirm Reject"}
                        </button>
                        <button className="btn btn-secondary" onClick={() => { setShowRejectForm(false); setActionError("") }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {isAdmin && selected.status === "SUBMITTED" && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Partial Approval</h3>
                  <p className="text-xs text-gray-500 mb-3">Use the checkboxes in the entry table above to select which entries to approve.</p>
                  <button
                    className="btn btn-secondary"
                    disabled={actionLoading || (approvedCount === 0 && rejectedCount === 0)}
                    onClick={handlePartialApproval}
                  >
                    {actionLoading ? "Processing…" : `Partially Approve (${approvedCount} approved, ${rejectedCount} rejected)`}
                  </button>
                </div>
              )}

              {isAdmin && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Admin Overrides</h3>
                  <div className="flex flex-wrap gap-3 mb-4">
                    <button className="btn btn-primary text-xs" disabled={actionLoading} onClick={() => { setOverrideAction("FORCE_APPROVE"); setOverrideReason(""); setOverrideError("") }}>
                      Force Approve
                    </button>
                    <button className="btn btn-danger text-xs" disabled={actionLoading} onClick={() => { setOverrideAction("FORCE_REJECT"); setOverrideReason(""); setOverrideError("") }}>
                      Force Reject
                    </button>
                    <button className="btn btn-secondary text-xs" disabled={actionLoading} onClick={() => { setOverrideAction("RESET_TO_DRAFT"); setOverrideReason(""); setOverrideError("") }}>
                      Reset to Draft
                    </button>
                    {selected.status === "SUBMITTED" && (
                      <button className="btn btn-secondary text-xs" disabled={actionLoading} onClick={handleResendApprovalEmail}>
                        Resend Approval Email
                      </button>
                    )}
                  </div>
                  {overrideAction && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-4 space-y-3">
                      <p className="text-sm font-medium text-amber-800">
                        Confirm:{" "}
                        {overrideAction === "FORCE_APPROVE" ? "Force Approve" : overrideAction === "FORCE_REJECT" ? "Force Reject" : "Reset to Draft"}
                      </p>
                      {overrideError && <p className="text-sm text-red-600">{overrideError}</p>}
                      <div>
                        <label className="label">Reason (required)</label>
                        <textarea className="input" rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} placeholder="Provide a reason for this override…" />
                      </div>
                      <div className="flex gap-3">
                        <button className="btn btn-primary text-xs" disabled={actionLoading || !overrideReason.trim()} onClick={handleOverride}>
                          {actionLoading ? "Processing…" : "Confirm"}
                        </button>
                        <button className="btn btn-secondary text-xs" onClick={() => { setOverrideAction(null); setOverrideReason(""); setOverrideError("") }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Expenses approvals
// ─────────────────────────────────────────────────────────────
function ExpensesApprovals({ isAdmin }: { isAdmin: boolean }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<"pending" | "approved">("pending")

  const [selected, setSelected] = useState<Expense | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState("")
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectionNote, setRejectionNote] = useState("")

  async function load() {
    setLoading(true)
    try {
      const [submitted, approved] = await Promise.all([
        fetch("/api/expenses?status=SUBMITTED&forReview=true").then((r) => r.json()),
        fetch("/api/expenses?status=APPROVED&forReview=true").then((r) => r.json()),
      ])
      setExpenses([
        ...(Array.isArray(submitted) ? submitted : []),
        ...(Array.isArray(approved) ? approved : []),
      ])
    } catch {
      setExpenses([])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openModal(e: Expense) {
    setSelected(e)
    setActionError("")
    setShowRejectForm(false)
    setRejectionNote("")
  }

  function closeModal() {
    setSelected(null)
    setActionError("")
    setShowRejectForm(false)
    setRejectionNote("")
  }

  async function handleApprove() {
    if (!selected) return
    setActionLoading(true)
    setActionError("")
    try {
      const res = await fetch(`/api/expenses/${selected.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      })
      if (!res.ok) {
        const data = await res.json()
        setActionError(data.error ?? "Failed to approve.")
      } else {
        await load()
        closeModal()
      }
    } catch {
      setActionError("Network error.")
    }
    setActionLoading(false)
  }

  async function handleReject() {
    if (!selected) return
    if (!rejectionNote.trim()) { setActionError("A rejection note is required."); return }
    setActionLoading(true)
    setActionError("")
    try {
      const res = await fetch(`/api/expenses/${selected.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", rejectionNote: rejectionNote.trim() }),
      })
      if (!res.ok) {
        const data = await res.json()
        setActionError(data.error ?? "Failed to reject.")
      } else {
        await load()
        closeModal()
      }
    } catch {
      setActionError("Network error.")
    }
    setActionLoading(false)
  }

  const pending = expenses.filter((e) => e.status === "SUBMITTED")
  const approved = expenses.filter((e) => e.status === "APPROVED")
  const displayed = tab === "pending" ? pending : approved

  return (
    <>
      <p className="text-sm text-gray-500 -mt-4 mb-4">
        {pending.length} awaiting approval · {approved.length} approved
      </p>

      {/* Tabs */}
      <div className="flex gap-0 mb-4 border-b border-gray-200">
        {(["pending", "approved"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "pending" ? `Pending (${pending.length})` : "Approved"}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {tab === "pending" ? "No expenses awaiting approval." : "No approved expenses yet."}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Submitted by</th>
                <th>Client</th>
                <th>Description</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Submitted</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.date)}</td>
                  <td className="font-medium text-gray-900">{e.manager.name}</td>
                  <td className="text-gray-500">{e.client?.name ?? "—"}</td>
                  <td className="text-gray-700 max-w-xs truncate">{e.description}</td>
                  <td className="text-gray-500">{e.category}</td>
                  <td className="font-mono text-sm">{e.currency} {parseFloat(e.amount).toFixed(2)}</td>
                  <td className="text-gray-400">{e.submittedAt ? formatDate(e.submittedAt) : "—"}</td>
                  <td>
                    <span className={`badge ${EX_STATUS_CLASSES[e.status] ?? "badge-draft"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td>
                    {e.status === "SUBMITTED" && (
                      <button className="btn btn-secondary text-xs py-1 px-2" onClick={() => openModal(e)}>
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Expense review modal */}
      {selected && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-box max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Review Expense</h2>
                <p className="text-sm text-gray-500 mt-0.5">{selected.manager.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${EX_STATUS_CLASSES[selected.status] ?? "badge-draft"}`}>
                  {selected.status}
                </span>
                <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl font-light">×</button>
              </div>
            </div>

            <div className="px-6 py-4 space-y-4">
              {actionError && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-sm text-red-700">{actionError}</p>
                </div>
              )}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">Date</dt>
                  <dd className="font-medium">{formatDate(selected.date)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Amount</dt>
                  <dd className="font-mono font-medium">{selected.currency} {parseFloat(selected.amount).toFixed(2)}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Category</dt>
                  <dd>{selected.category}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Client</dt>
                  <dd>{selected.client?.name ?? "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-500">Description</dt>
                  <dd>{selected.description}</dd>
                </div>
              </dl>

              {selected.status === "SUBMITTED" && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Actions</h3>
                  {!showRejectForm ? (
                    <div className="flex gap-3">
                      <button className="btn btn-primary" disabled={actionLoading} onClick={handleApprove}>
                        {actionLoading ? "Processing…" : "Approve"}
                      </button>
                      <button className="btn btn-danger" disabled={actionLoading} onClick={() => { setShowRejectForm(true); setActionError("") }}>
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="label">Rejection note (required)</label>
                        <textarea
                          className="input"
                          rows={3}
                          value={rejectionNote}
                          onChange={(e) => setRejectionNote(e.target.value)}
                          placeholder="Explain why this expense is being rejected…"
                        />
                      </div>
                      <div className="flex gap-3">
                        <button className="btn btn-danger" disabled={actionLoading || !rejectionNote.trim()} onClick={handleReject}>
                          {actionLoading ? "Rejecting…" : "Confirm Reject"}
                        </button>
                        <button className="btn btn-secondary" onClick={() => { setShowRejectForm(false); setActionError("") }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
