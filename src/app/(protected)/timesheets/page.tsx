"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TimesheetEntry {
  id: string; date: string; hours: string | number; description: string
  isBillable: boolean; status: string; timesheetId: string | null
  project: { id: string; name: string; rateOverride: string | null } | null
  phase: { id: string; name: string } | null
  category: { id: string; name: string; colour: string } | null
}
interface Timesheet {
  id: string; periodStart: string; periodEnd: string; granularity: string; status: string
  rejectionNote: string | null; submittedAt: string | null; approvedAt: string | null; approvedBy: string | null
  client: { id: string; name: string; reference: string | null; defaultRate: string | null; invoiceCurrency: string }
  entries: TimesheetEntry[]
}
interface Client { id: string; name: string }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const fmt = (d: string | Date) => new Date(d).toLocaleDateString("en-GB")
const STATUS_LIST = ["", "DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_APPROVED", "REJECTED", "INVOICED"]

function statusClass(s: string) {
  return s === "DRAFT" ? "badge-draft" : s === "SUBMITTED" ? "badge-submitted" : s === "APPROVED" ? "badge-approved" : s === "REJECTED" ? "badge-rejected" : s === "INVOICED" ? "badge-invoiced" : s === "PARTIALLY_APPROVED" ? "bg-amber-100 text-amber-800 border border-amber-200" : "badge-draft"
}

function calcTotals(entries: TimesheetEntry[], rate: number) {
  const total    = entries.reduce((s, e) => s + Number(e.hours), 0)
  const billable = entries.filter(e => e.isBillable).reduce((s, e) => s + Number(e.hours), 0)
  const value    = billable * rate
  return { total, billable, nonBillable: total - billable, value }
}

function downloadTimesheetCsv(ts: Timesheet) {
  const rate = Number(ts.client.defaultRate ?? 0)
  const rows = [["Date","Project","Phase","Category","Hours","Billable","Description","Status","Rate","Value"]]
  for (const e of ts.entries) {
    const r = Number(e.project?.rateOverride ?? rate)
    const v = e.isBillable ? Number(e.hours) * r : 0
    rows.push([
      fmt(e.date), e.project?.name ?? "", e.phase?.name ?? "", e.category?.name ?? "",
      Number(e.hours).toFixed(2), e.isBillable ? "Yes" : "No",
      `"${(e.description ?? "").replace(/"/g, '""')}"`, e.status,
      r.toFixed(2), v.toFixed(2),
    ])
  }
  const csv = rows.map(r => r.join(",")).join("\n")
  const blob = new Blob([csv], { type: "text/csv" })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement("a"); a.href = url; a.download = `timesheet-${ts.id.slice(-8)}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// Group entries by project → phase
function groupEntries(entries: TimesheetEntry[]) {
  const map: Record<string, { project: string | null; phases: Record<string, { phase: string | null; entries: TimesheetEntry[] }> }> = {}
  for (const e of entries) {
    const pk = e.project?.id ?? "_none"
    const pn = e.project?.name ?? "No project"
    const phk = e.phase?.id ?? "_none"
    const phn = e.phase?.name ?? null
    if (!map[pk]) map[pk] = { project: pn, phases: {} }
    if (!map[pk].phases[phk]) map[pk].phases[phk] = { phase: phn, entries: [] }
    map[pk].phases[phk].entries.push(e)
  }
  return Object.values(map)
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function TimesheetsPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "ADMIN"

  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [clients,    setClients]    = useState<Client[]>([])
  const [loading,    setLoading]    = useState(true)

  // Filters
  const [filterClient, setFilterClient] = useState("")
  const [filterStatus, setFilterStatus] = useState("")

  // Detail modal
  const [detail, setDetail] = useState<Timesheet | null>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [actionMsg,  setActionMsg]  = useState("")

  // Approve/reject in detail
  const [approveOpen,   setApproveOpen]  = useState(false)
  const [rejectNote,    setRejectNote]   = useState("")
  const [forceAction,   setForceAction]  = useState<string | null>(null)
  const [forceReason,   setForceReason]  = useState("")
  const [partialSel,    setPartialSel]   = useState<Set<string>>(new Set())
  const [partialReject, setPartialReject] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterClient) params.set("clientId", filterClient)
    if (filterStatus) params.set("status",   filterStatus)
    const [ts] = await Promise.all([
      fetch(`/api/timesheets?${params}`).then(r => r.json()),
    ])
    setTimesheets(Array.isArray(ts) ? ts : [])
    setLoading(false)
  }

  useEffect(() => {
    fetch("/api/clients").then(r => r.json()).then(setClients)
  }, [])
  useEffect(() => { load() }, [filterClient, filterStatus])

  async function submitTimesheet(id: string) {
    setSubmitting(id)
    const res = await fetch(`/api/timesheets/${id}/submit`, { method: "POST" })
    const data = await res.json()
    if (res.ok) {
      setActionMsg(`Submitted. Status: ${data.status}`)
      await load()
    } else {
      setActionMsg(data.error ?? "Failed")
    }
    setSubmitting(null)
    setTimeout(() => setActionMsg(""), 4000)
  }

  async function doApprove(id: string) {
    setSubmitting(id)
    const res = await fetch(`/api/timesheets/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "APPROVE" }),
    })
    const data = await res.json()
    setActionMsg(res.ok ? "Approved!" : (data.error ?? "Failed"))
    await load()
    if (detail?.id === id) setDetail(null)
    setSubmitting(null)
    setApproveOpen(false)
    setTimeout(() => setActionMsg(""), 3000)
  }

  async function doReject(id: string) {
    if (!rejectNote.trim()) return
    setSubmitting(id)
    const res = await fetch(`/api/timesheets/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REJECT", rejectionNote: rejectNote }),
    })
    const data = await res.json()
    setActionMsg(res.ok ? "Rejected." : (data.error ?? "Failed"))
    await load()
    if (detail?.id === id) setDetail(null)
    setSubmitting(null)
    setRejectNote("")
    setTimeout(() => setActionMsg(""), 3000)
  }

  async function doPartialApprove(id: string) {
    const approvedEntryIds = Array.from(partialSel)
    const rejectedEntryIds = Array.from(partialReject)
    if (!approvedEntryIds.length || !rejectedEntryIds.length) return
    setSubmitting(id)
    const res = await fetch(`/api/timesheets/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "PARTIAL", approvedEntryIds, rejectedEntryIds }),
    })
    const data = await res.json()
    setActionMsg(res.ok ? "Partial approval saved." : (data.error ?? "Failed"))
    await load()
    if (detail?.id === id) setDetail(null)
    setSubmitting(null)
    setPartialSel(new Set()); setPartialReject(new Set())
    setTimeout(() => setActionMsg(""), 3000)
  }

  async function doForce(id: string) {
    if (!forceReason.trim()) return
    setSubmitting(id)
    const res = await fetch(`/api/timesheets/${id}/force`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: forceAction, reason: forceReason }),
    })
    const data = await res.json()
    setActionMsg(res.ok ? "Done." : (data.error ?? "Failed"))
    await load()
    if (detail?.id === id) setDetail(null)
    setSubmitting(null)
    setForceAction(null); setForceReason("")
    setTimeout(() => setActionMsg(""), 3000)
  }

  async function doResendEmail(id: string) {
    setSubmitting(id)
    await fetch(`/api/timesheets/${id}/resend-approval`, { method: "POST" })
    setActionMsg("Approval email resent.")
    setSubmitting(null)
    setTimeout(() => setActionMsg(""), 3000)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
        <p className="text-sm text-gray-500 mt-1">Submitted timesheet bundles</p>
      </div>

      {actionMsg && (
        <div className="mb-4 card p-3 bg-blue-50 border-blue-200 text-sm text-blue-800">{actionMsg}</div>
      )}

      {/* Filters */}
      <div className="card p-3 mb-4 flex flex-wrap gap-3 items-end">
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
            {STATUS_LIST.map(s => <option key={s} value={s}>{s || "All"}</option>)}
          </select>
        </div>
        {(filterClient || filterStatus) && (
          <button onClick={() => { setFilterClient(""); setFilterStatus("") }} className="btn-secondary btn text-sm py-1.5">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : timesheets.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No timesheets found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Period</th>
                <th>Granularity</th>
                <th>Status</th>
                <th>Hours</th>
                <th>Billable</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {timesheets.map(ts => {
                const rate = Number(ts.client.defaultRate ?? 0)
                const totals = calcTotals(ts.entries, rate)
                return (
                  <tr key={ts.id}>
                    <td className="font-medium text-gray-900">{ts.client.name}</td>
                    <td className="text-sm">{fmt(ts.periodStart)} – {fmt(ts.periodEnd)}</td>
                    <td><span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{ts.granularity}</span></td>
                    <td><span className={`badge ${statusClass(ts.status)}`}>{ts.status}</span></td>
                    <td>{totals.total.toFixed(2)}h</td>
                    <td>{totals.billable.toFixed(2)}h</td>
                    <td className="text-gray-400 text-sm">{ts.submittedAt ? fmt(ts.submittedAt) : "—"}</td>
                    <td>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setDetail(ts); setPartialSel(new Set(ts.entries.filter(e => e.status === "SUBMITTED").map(e => e.id))); setPartialReject(new Set()) }} className="btn-secondary btn text-xs py-0.5">View</button>
                        {ts.status === "DRAFT" && (
                          <button onClick={() => submitTimesheet(ts.id)} disabled={submitting === ts.id} className="btn-primary btn text-xs py-0.5">{submitting === ts.id ? "…" : "Submit"}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-backdrop" onClick={() => { setDetail(null); setApproveOpen(false); setForceAction(null) }}>
          <div className="modal-box max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{detail.client.name}</h2>
                <p className="text-sm text-gray-500">{fmt(detail.periodStart)} – {fmt(detail.periodEnd)} · <span className={`badge ${statusClass(detail.status)}`}>{detail.status}</span></p>
              </div>
              <button onClick={() => downloadTimesheetCsv(detail)} className="btn-secondary btn text-sm">⬇ CSV</button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {detail.rejectionNote && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-800 mb-1">Rejection note</p>
                  <p className="text-sm text-red-600">{detail.rejectionNote}</p>
                </div>
              )}

              {/* Entries grouped by project/phase */}
              {groupEntries(detail.entries).map((pg, pi) => (
                <div key={pi}>
                  <p className="text-sm font-semibold text-gray-700 mb-2">{pg.project ?? "No project"}</p>
                  {Object.values(pg.phases).map((phg, phi) => (
                    <div key={phi} className="mb-3">
                      {phg.phase && <p className="text-xs text-gray-500 mb-1 ml-2">Phase: {phg.phase}</p>}
                      <table className="data-table text-sm">
                        <thead>
                          <tr>
                            {detail.status === "SUBMITTED" && isAdmin && <th className="w-8" />}
                            <th>Date</th><th>Category</th><th>Hours</th><th>Bill.</th><th>Description</th><th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {phg.entries.map(e => (
                            <tr key={e.id} className={partialReject.has(e.id) ? "bg-red-50" : partialSel.has(e.id) ? "bg-green-50" : ""}>
                              {detail.status === "SUBMITTED" && isAdmin && (
                                <td>
                                  <div className="flex gap-0.5">
                                    <input type="checkbox" title="Approve" checked={partialSel.has(e.id)} onChange={ev => {
                                      setPartialSel(prev => { const s = new Set(prev); ev.target.checked ? s.add(e.id) : s.delete(e.id); return s })
                                      setPartialReject(prev => { const s = new Set(prev); s.delete(e.id); return s })
                                    }} className="w-3 h-3" />
                                    <input type="checkbox" title="Reject" checked={partialReject.has(e.id)} onChange={ev => {
                                      setPartialReject(prev => { const s = new Set(prev); ev.target.checked ? s.add(e.id) : s.delete(e.id); return s })
                                      setPartialSel(prev => { const s = new Set(prev); s.delete(e.id); return s })
                                    }} className="w-3 h-3 accent-red-500" />
                                  </div>
                                </td>
                              )}
                              <td>{fmt(e.date)}</td>
                              <td>{e.category ? <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.category.colour }} />{e.category.name}</span> : "—"}</td>
                              <td>{Number(e.hours).toFixed(2)}</td>
                              <td>{e.isBillable ? "✓" : "—"}</td>
                              <td className="max-w-xs truncate">{e.description}</td>
                              <td><span className={`badge text-xs ${statusClass(e.status)}`}>{e.status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ))}

              {/* Totals */}
              {(() => { const t = calcTotals(detail.entries, Number(detail.client.defaultRate ?? 0)); return (
                <div className="bg-gray-50 rounded-lg p-3 grid grid-cols-3 gap-3 text-sm">
                  <div><p className="text-gray-500">Total hours</p><p className="font-semibold">{t.total.toFixed(2)}h</p></div>
                  <div><p className="text-gray-500">Billable</p><p className="font-semibold text-green-700">{t.billable.toFixed(2)}h</p></div>
                  <div><p className="text-gray-500">Est. value</p><p className="font-semibold">{detail.client.invoiceCurrency} {t.value.toFixed(2)}</p></div>
                </div>
              )})()}

              {/* Dates */}
              <div className="text-xs text-gray-400 space-y-0.5">
                {detail.submittedAt && <p>Submitted: {fmt(detail.submittedAt)}</p>}
                {detail.approvedAt  && <p>Approved: {fmt(detail.approvedAt)} by {detail.approvedBy ?? "—"}</p>}
              </div>

              {/* Approval actions (SUBMITTED) */}
              {detail.status === "SUBMITTED" && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">Approval actions</p>

                  {/* Standard approve/reject */}
                  {!approveOpen ? (
                    <div className="flex gap-2">
                      <button onClick={() => doApprove(detail.id)} disabled={!!submitting} className="btn-primary btn text-sm">Approve all</button>
                      <button onClick={() => setApproveOpen(true)} className="btn-danger btn text-sm">Reject</button>
                      {isAdmin && partialSel.size > 0 && partialReject.size > 0 && (
                        <button onClick={() => doPartialApprove(detail.id)} disabled={!!submitting} className="btn text-sm bg-amber-500 text-white hover:bg-amber-600">
                          Partially approve ({partialSel.size} ✓ / {partialReject.size} ✗)
                        </button>
                      )}
                      {isAdmin && <button onClick={() => doResendEmail(detail.id)} disabled={!!submitting} className="btn-secondary btn text-sm">Resend email</button>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <textarea rows={3} className="input text-sm w-full" placeholder="Rejection note (required)…" value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
                      <div className="flex gap-2">
                        <button onClick={() => doReject(detail.id)} disabled={!rejectNote.trim() || !!submitting} className="btn-danger btn text-sm">Confirm Reject</button>
                        <button onClick={() => { setApproveOpen(false); setRejectNote("") }} className="btn-secondary btn text-sm">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Admin overrides */}
              {isAdmin && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Admin overrides</p>
                  {!forceAction ? (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setForceAction("FORCE_APPROVE")} className="btn text-sm bg-green-600 text-white hover:bg-green-700">Force Approve</button>
                      <button onClick={() => setForceAction("FORCE_REJECT")}  className="btn btn-danger text-sm">Force Reject</button>
                      <button onClick={() => setForceAction("RESET_TO_DRAFT")} className="btn-secondary btn text-sm">Reset to Draft</button>
                    </div>
                  ) : (
                    <div className="space-y-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-amber-800">{forceAction.replace(/_/g," ")} — reason required</p>
                      <textarea rows={2} className="input text-sm w-full" placeholder="Enter a mandatory reason…" value={forceReason} onChange={e => setForceReason(e.target.value)} />
                      <div className="flex gap-2">
                        <button onClick={() => doForce(detail.id)} disabled={!forceReason.trim() || !!submitting} className="btn-primary btn text-sm">Confirm</button>
                        <button onClick={() => { setForceAction(null); setForceReason("") }} className="btn-secondary btn text-sm">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
              <button onClick={() => { setDetail(null); setApproveOpen(false); setForceAction(null) }} className="btn-secondary btn">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
