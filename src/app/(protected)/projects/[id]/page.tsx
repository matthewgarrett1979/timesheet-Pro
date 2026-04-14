"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

interface Phase {
  id: string
  projectId: string
  name: string
  description?: string | null
  billingType: string
  budgetHours: string | null
  contingencyHours: string | null
  budgetValue: string | null
  startDate: string | null
  endDate: string | null
  status: string
}

interface Project {
  id: string
  name: string
  description?: string | null
  active: boolean
  billingType: string
  budgetHours: string | null
  contingencyHours: string | null
  budgetValue: string | null
  drawdownRate: string | null
  rateOverride: string | null
  client: { id: string; name: string }
}

interface TimeEntry {
  id: string
  hours: string | number
  projectId: string | null
}

const BILLING_TYPE_LABELS: Record<string, string> = {
  TIME_AND_MATERIALS: "T&M",
  DRAWDOWN: "Drawdown",
  FIXED: "Fixed",
}

const STATUS_CLASSES: Record<string, string> = {
  ACTIVE: "badge-approved",
  COMPLETED: "badge-invoiced",
  ON_HOLD: "badge-draft",
  CANCELLED: "badge-rejected",
}

const PHASE_STATUS_OPTIONS = ["ACTIVE", "COMPLETED", "ON_HOLD", "CANCELLED"]
const BILLING_TYPE_OPTIONS = ["TIME_AND_MATERIALS", "DRAWDOWN", "FIXED"]

function formatDate(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-GB")
}

function healthBadge(pct: number) {
  if (pct >= 90) return <span className="badge badge-rejected">Over Budget</span>
  if (pct >= 75) return <span className="badge" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>At Risk</span>
  return <span className="badge badge-approved">On Track</span>
}

export default function ProjectDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()

  const [project, setProject] = useState<Project | null>(null)
  const [phases, setPhases] = useState<Phase[]>([])
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Add phase form
  const [showAddPhase, setShowAddPhase] = useState(false)
  const [addPhaseForm, setAddPhaseForm] = useState({
    name: "",
    billingType: "TIME_AND_MATERIALS",
    budgetHours: "",
    contingencyHours: "",
    status: "ACTIVE",
  })
  const [addPhaseLoading, setAddPhaseLoading] = useState(false)
  const [addPhaseError, setAddPhaseError] = useState("")

  // Edit phase
  const [editPhaseId, setEditPhaseId] = useState<string | null>(null)
  const [editPhaseForm, setEditPhaseForm] = useState({
    name: "",
    billingType: "TIME_AND_MATERIALS",
    budgetHours: "",
    contingencyHours: "",
    status: "ACTIVE",
  })
  const [editPhaseLoading, setEditPhaseLoading] = useState(false)
  const [editPhaseError, setEditPhaseError] = useState("")

  // Delete phase
  const [deletePhaseId, setDeletePhaseId] = useState<string | null>(null)
  const [deletePhaseLoading, setDeletePhaseLoading] = useState(false)

  async function loadAll() {
    setLoading(true)
    setError("")
    try {
      const [projRes, phasesRes, entriesRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/projects/${id}/phases`),
        fetch(`/api/time-entries?projectId=${id}`),
      ])
      if (!projRes.ok) {
        setError("Project not found.")
        setLoading(false)
        return
      }
      const projData = await projRes.json()
      setProject(projData)

      if (phasesRes.ok) {
        const phasesData = await phasesRes.json()
        setPhases(Array.isArray(phasesData) ? phasesData : [])
      }

      if (entriesRes.ok) {
        const entriesData = await entriesRes.json()
        setEntries(Array.isArray(entriesData) ? entriesData : [])
      }
    } catch {
      setError("Failed to load project.")
    }
    setLoading(false)
  }

  useEffect(() => {
    if (id) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const totalHours = entries.reduce((acc, e) => acc + Number(e.hours), 0)

  async function handleAddPhase(e: React.FormEvent) {
    e.preventDefault()
    if (!addPhaseForm.name.trim()) { setAddPhaseError("Name is required."); return }
    setAddPhaseLoading(true)
    setAddPhaseError("")
    try {
      const res = await fetch(`/api/projects/${id}/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addPhaseForm.name.trim(),
          billingType: addPhaseForm.billingType,
          budgetHours: addPhaseForm.budgetHours ? addPhaseForm.budgetHours : null,
          contingencyHours: addPhaseForm.contingencyHours ? addPhaseForm.contingencyHours : null,
          status: addPhaseForm.status,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setAddPhaseError(d.error ?? "Failed to add phase.")
      } else {
        setShowAddPhase(false)
        setAddPhaseForm({ name: "", billingType: "TIME_AND_MATERIALS", budgetHours: "", contingencyHours: "", status: "ACTIVE" })
        loadAll()
      }
    } catch {
      setAddPhaseError("Network error.")
    }
    setAddPhaseLoading(false)
  }

  function startEditPhase(phase: Phase) {
    setEditPhaseId(phase.id)
    setEditPhaseForm({
      name: phase.name,
      billingType: phase.billingType,
      budgetHours: phase.budgetHours ?? "",
      contingencyHours: phase.contingencyHours ?? "",
      status: phase.status,
    })
    setEditPhaseError("")
  }

  async function handleEditPhase(e: React.FormEvent) {
    e.preventDefault()
    if (!editPhaseId) return
    if (!editPhaseForm.name.trim()) { setEditPhaseError("Name is required."); return }
    setEditPhaseLoading(true)
    setEditPhaseError("")
    try {
      const res = await fetch(`/api/projects/${id}/phases/${editPhaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editPhaseForm.name.trim(),
          billingType: editPhaseForm.billingType,
          budgetHours: editPhaseForm.budgetHours ? editPhaseForm.budgetHours : null,
          contingencyHours: editPhaseForm.contingencyHours ? editPhaseForm.contingencyHours : null,
          status: editPhaseForm.status,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setEditPhaseError(d.error ?? "Failed to update phase.")
      } else {
        setEditPhaseId(null)
        loadAll()
      }
    } catch {
      setEditPhaseError("Network error.")
    }
    setEditPhaseLoading(false)
  }

  async function handleDeletePhase(phaseId: string) {
    setDeletePhaseLoading(true)
    try {
      const res = await fetch(`/api/projects/${id}/phases/${phaseId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setDeletePhaseId(null)
        loadAll()
      }
    } catch {
      // ignore
    }
    setDeletePhaseLoading(false)
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
  }

  if (error || !project) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link href="/projects" className="text-sm text-blue-600 hover:underline">← Back to Projects</Link>
        <div className="mt-4 bg-red-50 border border-red-200 rounded p-4">
          <p className="text-sm text-red-700">{error || "Project not found."}</p>
        </div>
      </div>
    )
  }

  const budgetHours = project.budgetHours ? Number(project.budgetHours) : null
  const contingencyHours = project.contingencyHours ? Number(project.contingencyHours) : 0
  const budgetPct = budgetHours && budgetHours > 0 ? (totalHours / budgetHours) * 100 : 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Back link */}
      <Link href="/projects" className="text-sm text-blue-600 hover:underline">
        ← Back to Projects
      </Link>

      {/* Project header */}
      <div className="card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
            <p className="text-sm text-gray-500 mt-1">{project.client.name}</p>
            {project.description && (
              <p className="text-sm text-gray-600 mt-2">{project.description}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`badge ${BILLING_TYPE_LABELS[project.billingType] === "T&M" ? "badge-submitted" : BILLING_TYPE_LABELS[project.billingType] === "Fixed" ? "badge-approved" : "badge-invoiced"}`}>
              {BILLING_TYPE_LABELS[project.billingType] ?? project.billingType}
            </span>
            {budgetHours ? healthBadge(budgetPct) : null}
            {!project.active && <span className="badge badge-draft">Inactive</span>}
          </div>
        </div>
      </div>

      {/* Budget/Usage widget */}
      {project.billingType === "DRAWDOWN" && budgetHours && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Hours Consumed (Drawdown)</h2>
          <div className="grid grid-cols-3 gap-4 mb-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-900">{budgetHours.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Purchased / Budget</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">{totalHours.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Used</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${budgetHours - totalHours < 0 ? "text-red-600" : "text-green-600"}`}>
                {(budgetHours - totalHours).toFixed(2)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Remaining</p>
            </div>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all ${budgetPct >= 100 ? "bg-red-500" : budgetPct >= 75 ? "bg-amber-400" : "bg-blue-500"}`}
              style={{ width: `${Math.min(100, budgetPct)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1 text-right">{budgetPct.toFixed(1)}% consumed</p>
          {project.drawdownRate && (
            <p className="text-xs text-gray-500 mt-2">Rate: £{Number(project.drawdownRate).toFixed(2)}/hr</p>
          )}
        </div>
      )}

      {project.billingType === "FIXED" && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Budget Burn (Fixed)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="text-center">
              <p className="text-xl font-bold text-gray-900">{budgetHours ? budgetHours.toFixed(2) : "—"}</p>
              <p className="text-xs text-gray-500 mt-1">Estimated Hours</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-blue-600">{totalHours.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Logged Hours</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-amber-500">{contingencyHours.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Contingency</p>
            </div>
            <div className="text-center">
              <p className={`text-xl font-bold ${budgetHours ? (budgetHours + contingencyHours - totalHours < 0 ? "text-red-600" : "text-green-600") : "text-gray-400"}`}>
                {budgetHours ? (budgetHours + contingencyHours - totalHours).toFixed(2) : "—"}
              </p>
              <p className="text-xs text-gray-500 mt-1">Remaining (incl. contingency)</p>
            </div>
          </div>
          {budgetHours && (
            <>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all ${budgetPct >= 100 ? "bg-red-500" : budgetPct >= 75 ? "bg-amber-400" : "bg-blue-500"}`}
                  style={{ width: `${Math.min(100, budgetPct)}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1 text-right">{budgetPct.toFixed(1)}% of budget used</p>
            </>
          )}
          {project.budgetValue && (
            <p className="text-xs text-gray-500 mt-2">Fixed value: £{Number(project.budgetValue).toFixed(2)}</p>
          )}
        </div>
      )}

      {project.billingType === "TIME_AND_MATERIALS" && (
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Time & Materials Summary</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Hours Logged</p>
              <p className="text-2xl font-bold text-gray-900">{totalHours.toFixed(2)}</p>
            </div>
            {project.rateOverride && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Rate</p>
                <p className="text-2xl font-bold text-gray-900">£{Number(project.rateOverride).toFixed(2)}/hr</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phases section */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Phases</h2>
          <button
            className="btn btn-primary text-sm"
            onClick={() => { setShowAddPhase(true); setAddPhaseError("") }}
          >
            Add Phase
          </button>
        </div>

        {/* Add phase form */}
        {showAddPhase && (
          <div className="px-4 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">New Phase</h3>
            <form onSubmit={handleAddPhase} className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Name *</label>
                <input
                  type="text"
                  className="input"
                  required
                  value={addPhaseForm.name}
                  onChange={(e) => setAddPhaseForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Billing Type</label>
                <select
                  className="input"
                  value={addPhaseForm.billingType}
                  onChange={(e) => setAddPhaseForm((f) => ({ ...f, billingType: e.target.value }))}
                >
                  {BILLING_TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{BILLING_TYPE_LABELS[o] ?? o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={addPhaseForm.status}
                  onChange={(e) => setAddPhaseForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {PHASE_STATUS_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Budget Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input"
                  value={addPhaseForm.budgetHours}
                  onChange={(e) => setAddPhaseForm((f) => ({ ...f, budgetHours: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Contingency Hours</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  className="input"
                  value={addPhaseForm.contingencyHours}
                  onChange={(e) => setAddPhaseForm((f) => ({ ...f, contingencyHours: e.target.value }))}
                />
              </div>
              {addPhaseError && (
                <div className="col-span-full">
                  <p className="text-sm text-red-600">{addPhaseError}</p>
                </div>
              )}
              <div className="col-span-full flex gap-3">
                <button type="submit" className="btn btn-primary text-sm" disabled={addPhaseLoading}>
                  {addPhaseLoading ? "Saving…" : "Add Phase"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary text-sm"
                  onClick={() => { setShowAddPhase(false); setAddPhaseError("") }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {phases.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No phases yet. Add a phase to break down this project.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Billing</th>
                <th>Status</th>
                <th className="text-right">Budget hrs</th>
                <th className="text-right">Contingency</th>
                <th className="text-right">% Used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {phases.map((phase) => {
                const phaseBudget = phase.budgetHours ? Number(phase.budgetHours) : null
                const phasePct = phaseBudget && phaseBudget > 0
                  ? Math.min(100, (totalHours / phaseBudget) * 100)
                  : null

                if (editPhaseId === phase.id) {
                  return (
                    <tr key={phase.id}>
                      <td colSpan={7} className="py-3 px-4 bg-blue-50">
                        <form onSubmit={handleEditPhase} className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div>
                            <label className="label">Name *</label>
                            <input
                              type="text"
                              className="input"
                              required
                              value={editPhaseForm.name}
                              onChange={(e) => setEditPhaseForm((f) => ({ ...f, name: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="label">Billing Type</label>
                            <select
                              className="input"
                              value={editPhaseForm.billingType}
                              onChange={(e) => setEditPhaseForm((f) => ({ ...f, billingType: e.target.value }))}
                            >
                              {BILLING_TYPE_OPTIONS.map((o) => (
                                <option key={o} value={o}>{BILLING_TYPE_LABELS[o] ?? o}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="label">Status</label>
                            <select
                              className="input"
                              value={editPhaseForm.status}
                              onChange={(e) => setEditPhaseForm((f) => ({ ...f, status: e.target.value }))}
                            >
                              {PHASE_STATUS_OPTIONS.map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="label">Budget Hours</label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              className="input"
                              value={editPhaseForm.budgetHours}
                              onChange={(e) => setEditPhaseForm((f) => ({ ...f, budgetHours: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="label">Contingency Hours</label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              className="input"
                              value={editPhaseForm.contingencyHours}
                              onChange={(e) => setEditPhaseForm((f) => ({ ...f, contingencyHours: e.target.value }))}
                            />
                          </div>
                          {editPhaseError && (
                            <div className="col-span-full">
                              <p className="text-sm text-red-600">{editPhaseError}</p>
                            </div>
                          )}
                          <div className="col-span-full flex gap-3">
                            <button type="submit" className="btn btn-primary text-xs" disabled={editPhaseLoading}>
                              {editPhaseLoading ? "Saving…" : "Save"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary text-xs"
                              onClick={() => { setEditPhaseId(null); setEditPhaseError("") }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={phase.id}>
                    <td className="font-medium text-gray-900">{phase.name}</td>
                    <td className="text-gray-500 text-xs">{BILLING_TYPE_LABELS[phase.billingType] ?? phase.billingType}</td>
                    <td>
                      <span className={`badge ${STATUS_CLASSES[phase.status] ?? "badge-draft"}`}>
                        {phase.status}
                      </span>
                    </td>
                    <td className="text-right font-mono">
                      {phaseBudget ? phaseBudget.toFixed(2) : "—"}
                    </td>
                    <td className="text-right font-mono">
                      {phase.contingencyHours ? Number(phase.contingencyHours).toFixed(2) : "—"}
                    </td>
                    <td className={`text-right font-mono text-sm ${phasePct !== null && phasePct >= 90 ? "text-red-600 font-semibold" : phasePct !== null && phasePct >= 75 ? "text-amber-600 font-semibold" : "text-gray-500"}`}>
                      {phasePct !== null ? `${phasePct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="space-x-3 whitespace-nowrap">
                      <button
                        onClick={() => startEditPhase(phase)}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                      {deletePhaseId === phase.id ? (
                        <>
                          <span className="text-xs text-gray-500">Delete?</span>
                          <button
                            onClick={() => handleDeletePhase(phase.id)}
                            disabled={deletePhaseLoading}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeletePhaseId(null)}
                            className="text-sm text-gray-400 hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setDeletePhaseId(phase.id)}
                          className="text-sm text-red-500 hover:underline"
                        >
                          Delete
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
    </div>
  )
}
