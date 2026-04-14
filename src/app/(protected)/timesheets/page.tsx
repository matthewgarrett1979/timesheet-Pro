"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"

interface Client {
  id: string
  name: string
  reference: string | null
}

interface ProjectOption {
  id: string
  name: string
  clientId: string
  active: boolean
  rateOverride: string | null
  client: { id: string; name: string }
}

interface TimesheetEntry {
  id: string
  date: string
  hours: number | string
  description: string
  projectId: string | null
  project: { id: string; name: string; rateOverride: string | null } | null
}

interface Timesheet {
  id: string
  weekStart: string
  status: string
  submittedAt: string | null
  approvedAt: string | null
  approvedBy: string | null
  client: { id: string; name: string; reference: string | null; defaultRate: string | null }
  entries: TimesheetEntry[]
}

const STATUS_OPTIONS = ["", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "INVOICED"]

const statusClass: Record<string, string> = {
  DRAFT: "badge-draft",
  SUBMITTED: "badge-submitted",
  APPROVED: "badge-approved",
  REJECTED: "badge-rejected",
  INVOICED: "badge-invoiced",
}

function buildUrl(params: { status?: string; project?: string }) {
  const p = new URLSearchParams()
  if (params.status) p.set("status", params.status)
  if (params.project) p.set("project", params.project)
  return p.size > 0 ? `/timesheets?${p}` : "/timesheets"
}

function TimesheetsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const statusFilter = searchParams.get("status") ?? ""
  const projectFilter = searchParams.get("project") ?? ""

  const [timesheets, setTimesheets] = useState<Timesheet[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [approvalToken, setApprovalToken] = useState<{ tsId: string; token: string } | null>(null)

  async function load() {
    const params = new URLSearchParams()
    if (statusFilter) params.set("status", statusFilter)
    if (projectFilter) params.set("projectId", projectFilter)
    const qs = params.size > 0 ? `?${params}` : ""
    const [ts, cl, pr] = await Promise.all([
      fetch(`/api/timesheets${qs}`).then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
    ])
    setTimesheets(Array.isArray(ts) ? ts : [])
    setClients(Array.isArray(cl) ? cl : [])
    setProjects(Array.isArray(pr) ? pr : [])
    setLoading(false)
  }

  useEffect(() => { setLoading(true); load() }, [statusFilter, projectFilter])

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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-sm text-gray-500 mt-1">{timesheets.length} result{timesheets.length !== 1 ? "s" : ""}</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>
          New timesheet
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 mb-2 flex-wrap items-center">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => router.push(buildUrl({ status: s || undefined, project: projectFilter || undefined }))}
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

      {projects.length > 0 && (
        <div className="flex gap-2 mb-4 items-center">
          <span className="text-xs text-gray-500">Project:</span>
          <select
            value={projectFilter}
            onChange={(e) => router.push(buildUrl({ status: statusFilter || undefined, project: e.target.value || undefined }))}
            className="px-3 py-1.5 rounded-full text-xs font-medium border border-gray-300 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.client.name} / {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

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
        ) : timesheets.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No timesheets found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Week starting</th>
                <th>Projects</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Approved by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {timesheets.map((ts) => {
                const entryProjects = Array.from(
                  new Set(ts.entries.map((e) => e.project?.name).filter(Boolean))
                ) as string[]
                return (
                  <tr key={ts.id}>
                    <td className="font-medium text-gray-900">{ts.client.name}</td>
                    <td>{new Date(ts.weekStart).toLocaleDateString("en-GB")}</td>
                    <td className="text-gray-500 text-xs">
                      {entryProjects.length > 0 ? entryProjects.join(", ") : "—"}
                    </td>
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
                )
              })}
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

function getMondayOfCurrentWeek(): string {
  const today = new Date()
  const day = today.getDay() // 0 = Sun, 1 = Mon … 6 = Sat
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(today)
  monday.setDate(today.getDate() + diff)
  return monday.toISOString().split("T")[0]
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
  const [weekStart, setWeekStart] = useState(() => getMondayOfCurrentWeek())
  const [entries, setEntries] = useState([
    { date: "", hours: "8", description: "", projectId: "" },
  ])
  const [clientProjects, setClientProjects] = useState<ProjectOption[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  // Fetch projects for the selected client whenever clientId changes
  useEffect(() => {
    if (!clientId) {
      setClientProjects([])
      return
    }
    setLoadingProjects(true)
    fetch(`/api/projects?clientId=${clientId}&active=true`)
      .then((r) => r.json())
      .then((data) => {
        setClientProjects(Array.isArray(data) ? data : [])
        setLoadingProjects(false)
      })
      .catch(() => {
        setClientProjects([])
        setLoadingProjects(false)
      })
  }, [clientId])

  function handleClientChange(id: string) {
    setClientId(id)
    setClientProjects([])
    setEntries((prev) => prev.map((e) => ({ ...e, projectId: "" })))
  }

  function addEntry() {
    if (entries.length < 7) setEntries([...entries, { date: "", hours: "8", description: "", projectId: "" }])
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
    if (entries.some((en) => !en.projectId)) {
      setError("All entries must have a project selected.")
      return
    }
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
          projectId: e.projectId,
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

  const projectDisabled = !clientId || loadingProjects
  const projectPlaceholder = !clientId
    ? "Select a client first"
    : loadingProjects
    ? "Loading projects…"
    : clientProjects.length === 0
    ? "No projects — add one first"
    : "Select…"

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box max-w-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">New Timesheet</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Client *</label>
              <select className="input" required value={clientId} onChange={(e) => handleClientChange(e.target.value)}>
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

            {clientId && !loadingProjects && clientProjects.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
                No active projects for this client. <a href="/projects" className="underline">Create a project</a> first.
              </p>
            )}

            <div className="space-y-2">
              {entries.map((entry, i) => (
                <div key={i} className="rounded-md border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4">
                      <input
                        type="date"
                        className="input text-xs"
                        required
                        value={entry.date}
                        onChange={(e) => updateEntry(i, "date", e.target.value)}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        className="input text-xs"
                        step="0.25"
                        min="0.25"
                        max="24"
                        required
                        placeholder="hrs"
                        value={entry.hours}
                        onChange={(e) => updateEntry(i, "hours", e.target.value)}
                      />
                    </div>
                    <div className="col-span-5">
                      <select
                        className="input text-xs"
                        required
                        value={entry.projectId}
                        onChange={(e) => updateEntry(i, "projectId", e.target.value)}
                        disabled={projectDisabled || clientProjects.length === 0}
                      >
                        <option value="">{projectPlaceholder}</option>
                        {clientProjects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {entries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeEntry(i)}
                          className="text-gray-400 hover:text-red-500 text-xl leading-none"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    className="input text-xs resize-none"
                    rows={2}
                    placeholder="Description of work performed *"
                    required
                    value={entry.description}
                    onChange={(e) => updateEntry(i, "description", e.target.value)}
                  />
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
