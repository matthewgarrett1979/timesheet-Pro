"use client"

import { useEffect, useState } from "react"

interface Client {
  id: string
  name: string
  defaultRate: number | null
}

interface Project {
  id: string
  name: string
  description: string | null
  active: boolean
  createdAt: string
  client: { id: string; name: string }
  billingType: "TM" | "DRAWDOWN" | "FIXED"
  rateOverride: number | null
  drawdownRate: number | null
  budgetHours: number | null
  contingencyHours: number | null
  budgetValue: number | null
}

const BILLING_LABELS: Record<string, string> = {
  TM: "T&M",
  DRAWDOWN: "Drawdown",
  FIXED: "Fixed",
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)

  async function load() {
    const [pr, cl] = await Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ])
    setProjects(pr)
    setClients(cl)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function toggleActive(p: Project) {
    await fetch(`/api/projects/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    })
    load()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            {projects.filter((p) => p.active).length} active
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => { setEditProject(null); setShowModal(true) }}
        >
          New project
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No projects yet. Create a client first, then add a project.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Client</th>
                <th>Billing</th>
                <th>Description</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium text-gray-900">{p.name}</td>
                  <td className="text-gray-500">{p.client.name}</td>
                  <td className="text-xs text-gray-500">{BILLING_LABELS[p.billingType] ?? p.billingType}</td>
                  <td className="text-gray-400 max-w-xs truncate">{p.description ?? "—"}</td>
                  <td>
                    <span className={`badge ${p.active ? "badge-approved" : "badge-draft"}`}>
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="space-x-3">
                    <button
                      onClick={() => { setEditProject(p); setShowModal(true) }}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => toggleActive(p)}
                      className="text-sm text-gray-400 hover:text-gray-700"
                    >
                      {p.active ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ProjectModal
          project={editProject}
          clients={clients}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function ProjectModal({
  project,
  clients,
  onClose,
  onSaved,
}: {
  project: Project | null
  clients: Client[]
  onClose: () => void
  onSaved: () => void
}) {
  const [clientId,       setClientId]       = useState(project?.client.id ?? "")
  const [name,           setName]           = useState(project?.name ?? "")
  const [description,    setDescription]    = useState(project?.description ?? "")
  const [billingType,    setBillingType]    = useState<"TM" | "DRAWDOWN" | "FIXED">(project?.billingType ?? "TM")
  const [rateOverride,   setRateOverride]   = useState(project?.rateOverride != null ? String(project.rateOverride) : "")
  const [drawdownRate,   setDrawdownRate]   = useState(project?.drawdownRate  != null ? String(project.drawdownRate)  : "")
  const [budgetHours,    setBudgetHours]    = useState(project?.budgetHours   != null ? String(project.budgetHours)   : "")
  const [contingencyHours, setContingencyHours] = useState(project?.contingencyHours != null ? String(project.contingencyHours) : "")
  const [budgetValue,    setBudgetValue]    = useState(project?.budgetValue   != null ? String(project.budgetValue)   : "")
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState("")

  // Resolve client defaultRate for the no-rate warning
  const selectedClient = clients.find((c) => c.id === (project?.client.id ?? clientId))
  const noRateConfigured =
    billingType === "TM" && !rateOverride && !selectedClient?.defaultRate

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!project && !clientId) { setError("Please select a client."); return }
    setSaving(true)
    setError("")

    const billingPayload = {
      billingType,
      rateOverride:     billingType === "TM"       && rateOverride      ? parseFloat(rateOverride)      : null,
      drawdownRate:     billingType === "DRAWDOWN"  && drawdownRate      ? parseFloat(drawdownRate)      : null,
      budgetHours:      (billingType === "DRAWDOWN" || billingType === "FIXED") && budgetHours ? parseFloat(budgetHours) : null,
      contingencyHours: billingType === "FIXED"     && contingencyHours ? parseFloat(contingencyHours) : null,
      budgetValue:      billingType === "FIXED"     && budgetValue       ? parseFloat(budgetValue)       : null,
    }

    const url    = project ? `/api/projects/${project.id}` : "/api/projects"
    const method = project ? "PATCH" : "POST"
    const body   = project
      ? { name, description: description || undefined, ...billingPayload }
      : { name, description: description || undefined, clientId, ...billingPayload }

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to save.")
      return
    }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-xl flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold">{project ? "Edit Project" : "New Project"}</h2>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          <form id="project-form" onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
            )}

            {!project && (
              <div>
                <label className="label">Client *</label>
                <select
                  className="input"
                  required
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">Select a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label">Project name *</label>
              <input
                type="text"
                className="input"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Description (optional)</label>
              <textarea
                className="input"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* ── Billing ──────────────────────────────────────── */}
            <div className="pt-2 pb-1 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Billing</p>
            </div>

            <div>
              <label className="label">Billing type</label>
              <select
                className="input"
                value={billingType}
                onChange={(e) => setBillingType(e.target.value as "TM" | "DRAWDOWN" | "FIXED")}
              >
                <option value="TM">T&amp;M — Time &amp; Materials</option>
                <option value="DRAWDOWN">Drawdown</option>
                <option value="FIXED">Fixed price</option>
              </select>
            </div>

            {/* T&M: rate override */}
            {billingType === "TM" && (
              <div>
                <label className="label">Hourly rate override (£/hr)</label>
                <input
                  type="number"
                  className="input w-40"
                  min="0"
                  step="0.01"
                  placeholder="Leave blank to use client rate"
                  value={rateOverride}
                  onChange={(e) => setRateOverride(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Overrides the client&apos;s default rate for this project.
                </p>
                {noRateConfigured && (
                  <p className="text-xs text-amber-600 mt-1 font-medium">
                    ⚠ No rate configured — set a rate here or add a default rate to the client.
                  </p>
                )}
              </div>
            )}

            {/* Drawdown: drawdown rate */}
            {billingType === "DRAWDOWN" && (
              <div>
                <label className="label">Drawdown rate (£/hr)</label>
                <input
                  type="number"
                  className="input w-40"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 95.00"
                  value={drawdownRate}
                  onChange={(e) => setDrawdownRate(e.target.value)}
                />
              </div>
            )}

            {/* Drawdown + Fixed: budget hours */}
            {(billingType === "DRAWDOWN" || billingType === "FIXED") && (
              <div>
                <label className="label">Budget hours</label>
                <input
                  type="number"
                  className="input w-40"
                  min="0"
                  step="0.5"
                  placeholder="e.g. 200"
                  value={budgetHours}
                  onChange={(e) => setBudgetHours(e.target.value)}
                />
              </div>
            )}

            {/* Fixed only: contingency hours + fixed price */}
            {billingType === "FIXED" && (
              <>
                <div>
                  <label className="label">Contingency hours</label>
                  <input
                    type="number"
                    className="input w-40"
                    min="0"
                    step="0.5"
                    placeholder="e.g. 20"
                    value={contingencyHours}
                    onChange={(e) => setContingencyHours(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Fixed price (£)</label>
                  <input
                    type="number"
                    className="input w-40"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 25000.00"
                    value={budgetValue}
                    onChange={(e) => setBudgetValue(e.target.value)}
                  />
                </div>
              </>
            )}
          </form>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 flex-shrink-0 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" form="project-form" disabled={saving} className="btn-primary">
            {saving ? "Saving…" : project ? "Save changes" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  )
}
