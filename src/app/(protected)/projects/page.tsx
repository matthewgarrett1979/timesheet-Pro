"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

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
  hoursLogged: number
}

const BILLING_LABELS: Record<string, string> = {
  TM: "T&M",
  DRAWDOWN: "Drawdown",
  FIXED: "Fixed",
}

function getHealth(p: Project): { label: string; cls: string } {
  const budget = p.budgetHours ? Number(p.budgetHours) : null
  if (!budget) return { label: "No budget", cls: "badge-draft" }
  const totalBudget = budget + (p.contingencyHours ? Number(p.contingencyHours) : 0)
  const pct = p.hoursLogged / totalBudget
  if (pct >= 1)   return { label: "Overrun",  cls: "badge-rejected" }
  if (pct >= 0.8) return { label: "At risk",  cls: "badge-submitted" }
  return { label: "On track", cls: "badge-approved" }
}

export default function ProjectsPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "ADMIN"

  const [projects, setProjects] = useState<Project[]>([])
  const [clients,  setClients]  = useState<Client[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showModal, setShowModal] = useState(false)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)
  const [deleteCounts, setDeleteCounts] = useState<Record<string, number> | null>(null)
  const [cascadeConfirm, setCascadeConfirm] = useState("")
  const [deleteInProgress, setDeleteInProgress] = useState(false)

  function openDelete(e: React.MouseEvent, p: Project) {
    e.stopPropagation()
    setDeleteTarget(p)
    setDeleteCounts(null)
    setCascadeConfirm("")
  }

  function closeDelete() {
    setDeleteTarget(null)
    setDeleteCounts(null)
    setCascadeConfirm("")
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteInProgress(true)
    const res = await fetch(`/api/projects/${deleteTarget.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: deleteCounts ? JSON.stringify({ cascade: true }) : undefined,
    })
    setDeleteInProgress(false)

    if (res.status === 204) {
      closeDelete()
      load()
    } else if (res.status === 409) {
      const data = await res.json().catch(() => ({}))
      setDeleteCounts(data.counts ?? {})
    }
  }

  async function load() {
    const [pr, cl] = await Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ])
    setProjects(Array.isArray(pr) ? pr : [])
    setClients(Array.isArray(cl) ? cl : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">
            {projects.filter((p) => p.active).length} active
          </p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          New project
        </button>
      </div>

      <div className="card overflow-x-auto">
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
                <th>Health</th>
                <th>Status</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const health = getHealth(p)
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(`/projects/${p.id}`)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <td className="font-medium text-gray-900">{p.name}</td>
                    <td className="text-gray-500">{p.client.name}</td>
                    <td className="text-xs text-gray-500">
                      {BILLING_LABELS[p.billingType] ?? p.billingType}
                    </td>
                    <td>
                      <span className={`badge ${health.cls}`}>{health.label}</span>
                    </td>
                    <td>
                      <span className={`badge ${p.active ? "badge-approved" : "badge-draft"}`}>
                        {p.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    {isAdmin && (
                      <td>
                        <button
                          onClick={(e) => openDelete(e, p)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ProjectModal
          clients={clients}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={closeDelete}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            {deleteCounts ? (
              <>
                <h3 className="text-base font-semibold text-red-700 mb-2">Cascade delete — this cannot be undone</h3>
                <p className="text-sm text-gray-700 mb-3">
                  <span className="font-medium">{deleteTarget.name}</span> has associated records that will also be permanently deleted:
                </p>
                <ul className="text-sm text-gray-600 mb-3 space-y-1 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                  {Object.entries(deleteCounts).filter(([, v]) => v > 0).map(([k, v]) => (
                    <li key={k} className="flex justify-between">
                      <span className="capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                      <span className="font-medium">{v}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm font-medium text-gray-700 mb-1">Type the project name to confirm:</p>
                <input
                  type="text"
                  className="input mb-4"
                  placeholder={deleteTarget.name}
                  value={cascadeConfirm}
                  onChange={(e) => setCascadeConfirm(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-3 justify-end">
                  <button onClick={closeDelete} className="btn-secondary">Cancel</button>
                  <button
                    onClick={confirmDelete}
                    disabled={deleteInProgress || cascadeConfirm !== deleteTarget.name}
                    className="btn-danger"
                  >
                    {deleteInProgress ? "Deleting…" : "Delete everything"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-900 mb-2">Delete project?</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Permanently delete <span className="font-medium">{deleteTarget.name}</span>? This cannot be undone.
                </p>
                <div className="flex gap-3 justify-end">
                  <button onClick={closeDelete} className="btn-secondary">Cancel</button>
                  <button onClick={confirmDelete} disabled={deleteInProgress} className="btn-danger">
                    {deleteInProgress ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ProjectModal({
  clients,
  onClose,
  onSaved,
}: {
  clients: Client[]
  onClose: () => void
  onSaved: () => void
}) {
  const [clientId,          setClientId]          = useState("")
  const [name,              setName]              = useState("")
  const [description,       setDescription]       = useState("")
  const [billingType,       setBillingType]       = useState<"TM" | "DRAWDOWN" | "FIXED">("TM")
  const [rateOverride,      setRateOverride]      = useState("")
  const [drawdownRate,      setDrawdownRate]      = useState("")
  const [budgetHours,       setBudgetHours]       = useState("")
  const [contingencyHours,  setContingencyHours]  = useState("")
  const [budgetValue,       setBudgetValue]       = useState("")
  const [saving,            setSaving]            = useState(false)
  const [error,             setError]             = useState("")

  const selectedClient = clients.find((c) => c.id === clientId)
  const noRateConfigured =
    billingType === "TM" && !rateOverride && !selectedClient?.defaultRate

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) { setError("Please select a client."); return }
    setSaving(true)
    setError("")

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description: description || undefined,
        clientId,
        billingType,
        rateOverride:     billingType === "TM"       && rateOverride      ? parseFloat(rateOverride)      : null,
        drawdownRate:     billingType === "DRAWDOWN"  && drawdownRate      ? parseFloat(drawdownRate)      : null,
        budgetHours:      (billingType === "DRAWDOWN" || billingType === "FIXED") && budgetHours ? parseFloat(budgetHours) : null,
        contingencyHours: billingType === "FIXED"     && contingencyHours ? parseFloat(contingencyHours) : null,
        budgetValue:      billingType === "FIXED"     && budgetValue       ? parseFloat(budgetValue)       : null,
      }),
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
          <h2 className="text-lg font-semibold">New Project</h2>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0">
          <form id="project-form" onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
            )}

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

            {billingType === "TM" && (
              <div>
                <label className="label">Hourly rate override (£/hr)</label>
                <input
                  type="number" className="input w-40" min="0" step="0.01"
                  placeholder="Leave blank to use client rate"
                  value={rateOverride}
                  onChange={(e) => setRateOverride(e.target.value)}
                />
                {noRateConfigured && (
                  <p className="text-xs text-amber-600 mt-1 font-medium">
                    No rate configured — set one here or on the client.
                  </p>
                )}
              </div>
            )}

            {billingType === "DRAWDOWN" && (
              <div>
                <label className="label">Drawdown rate (£/hr)</label>
                <input
                  type="number" className="input w-40" min="0" step="0.01"
                  placeholder="e.g. 95.00"
                  value={drawdownRate}
                  onChange={(e) => setDrawdownRate(e.target.value)}
                />
              </div>
            )}

            {(billingType === "DRAWDOWN" || billingType === "FIXED") && (
              <div>
                <label className="label">Budget hours</label>
                <input
                  type="number" className="input w-40" min="0" step="0.5"
                  placeholder="e.g. 200"
                  value={budgetHours}
                  onChange={(e) => setBudgetHours(e.target.value)}
                />
              </div>
            )}

            {billingType === "FIXED" && (
              <>
                <div>
                  <label className="label">Contingency hours</label>
                  <input
                    type="number" className="input w-40" min="0" step="0.5"
                    placeholder="e.g. 20"
                    value={contingencyHours}
                    onChange={(e) => setContingencyHours(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Fixed price (£)</label>
                  <input
                    type="number" className="input w-40" min="0" step="0.01"
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
            {saving ? "Saving…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  )
}
