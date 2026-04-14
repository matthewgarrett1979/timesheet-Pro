"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"

interface Client {
  id: string
  name: string
  reference: string | null
}

interface Timesheet {
  id: string
  weekStart: string
  status: string
  submittedAt: string | null
  approvedAt: string | null
  approvedBy: string | null
  client: { id: string; name: string; reference: string | null }
  entries?: Array<{ id: string; date: string; hours: number; description: string }>
}

const STATUS_OPTIONS = ["", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "INVOICED"]

const statusClass: Record<string, string> = {
  DRAFT: "badge-draft",
  SUBMITTED: "badge-submitted",
  APPROVED: "badge-approved",
  REJECTED: "badge-rejected",
  INVOICED: "badge-invoiced",
}

function TimesheetsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const statusFilter = searchParams.get("status") ?? ""

  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [approvalToken, setApprovalToken] = useState<{ tsId: string; token: string } | null>(null)

  async function load() {
    const qs = statusFilter ? `?status=${statusFilter}` : ""
    const [ts, cl] = await Promise.all([
      fetch(`/api/timesheets${qs}`).then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ])
    setTimesheets(ts)
    setClients(cl)
    setLoading(false)
  }

  useEffect(() => { setLoading(true); load() }, [statusFilter])

  async function submitTimesheet(id: string) {
    setSubmitting(id)
    const res = await fetch(`/api/timesheets/${id}/submit`, { method: "POST" })
    setSubmitting(null)
    if (res.ok) {
      const data = await res.json()
      setApprovalToken({ tsId: id, token: data.approvalToken })
      load()
    }
  }

  const filtered = timesheets.filter((ts) => !statusFilter || ts.status === statusFilter)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          New timesheet
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => router.push(s ? `/timesheets?status=${s}` : "/timesheets")}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              statusFilter === s
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Approval token callout */}
      {approvalToken && (
        <div className="mb-4 card p-4 bg-green-50 border-green-200">
          <p className="text-sm font-medium text-green-800 mb-2">Timesheet submitted. Copy this approval link to send to your client:</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 text-xs bg-white border border-green-200 rounded px-3 py-2 break-all">
              {typeof window !== "undefined" ? window.location.origin : ""}/api/approvals/placeholder?token={approvalToken.token}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/approvals/placeholder?token=${approvalToken.token}`); }}
              className="btn-secondary text-xs shrink-0"
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-green-600 mt-2">
            Note: send this token to your client. They POST to <code>/api/approvals/[token]</code> to approve.
          </p>
          <button onClick={() => setApprovalToken(null)} className="mt-2 text-xs text-green-700 hover:underline">Dismiss</button>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No timesheets found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Week starting</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Approved by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ts) => (
                <tr key={ts.id}>
                  <td className="font-medium text-gray-900">{ts.client.name}</td>
                  <td>{new Date(ts.weekStart).toLocaleDateString("en-GB")}</td>
                  <td>
                    <span className={`badge ${statusClass[ts.status] ?? "badge-draft"}`}>
                      {ts.status}
                    </span>
                  </td>
                  <td className="text-gray-400">
                    {ts.submittedAt ? new Date(ts.submittedAt).toLocaleDateString("en-GB") : "—"}
                  </td>
                  <td className="text-gray-400 text-xs">{ts.approvedBy ?? "—"}</td>
                  <td>
                    {ts.status === "DRAFT" && (
                      <button
                        onClick={() => submitTimesheet(ts.id)}
                        disabled={submitting === ts.id}
                        className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                      >
                        {submitting === ts.id ? "Submitting…" : "Submit"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateTimesheetModal
          clients={clients}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
    </div>
  )
}

function CreateTimesheetModal({
  clients,
  onClose,
  onSaved,
}: {
  clients: Client[]
  onClose: () => void
  onSaved: () => void
}) {
  const [clientId, setClientId] = useState("")
  const [weekStart, setWeekStart] = useState("")
  const [entries, setEntries] = useState([
    { date: "", hours: "8", description: "" },
  ])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  function addEntry() {
    if (entries.length < 7) setEntries([...entries, { date: "", hours: "8", description: "" }])
  }

  function removeEntry(i: number) {
    setEntries(entries.filter((_, idx) => idx !== i))
  }

  function updateEntry(i: number, field: string, value: string) {
    setEntries(entries.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) { setError("Select a client."); return }
    setSaving(true)
    setError("")

    const res = await fetch("/api/timesheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        weekStart: new Date(weekStart).toISOString(),
        entries: entries.map((e) => ({
          date: new Date(e.date).toISOString(),
          hours: parseFloat(e.hours),
          description: e.description,
        })),
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to create timesheet.")
      return
    }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">New Timesheet</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client *</label>
              <select className="input" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Select…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Week starting *</label>
              <input type="date" className="input" required value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Entries *</label>
              {entries.length < 7 && (
                <button type="button" onClick={addEntry} className="text-xs text-blue-600 hover:underline">
                  + Add day
                </button>
              )}
            </div>
            <div className="space-y-2">
              {entries.map((entry, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-4">
                    <input type="date" className="input text-xs" required value={entry.date} onChange={(e) => updateEntry(i, "date", e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <input type="number" className="input text-xs" step="0.25" min="0.25" max="24" required value={entry.hours} onChange={(e) => updateEntry(i, "hours", e.target.value)} />
                  </div>
                  <div className="col-span-5">
                    <input type="text" className="input text-xs" placeholder="Description" required value={entry.description} onChange={(e) => updateEntry(i, "description", e.target.value)} />
                  </div>
                  <div className="col-span-1 flex items-center pt-1">
                    {entries.length > 1 && (
                      <button type="button" onClick={() => removeEntry(i)} className="text-gray-400 hover:text-red-500 text-lg leading-none">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Creating…" : "Create timesheet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function TimesheetsPage() {
  return (
    <Suspense>
      <TimesheetsContent />
    </Suspense>
  )
}
