"use client"

import { useEffect, useState } from "react"

interface Client {
  id: string
  name: string
}

interface Project {
  id: string
  name: string
  description: string | null
  active: boolean
  createdAt: string
  client: { id: string; name: string }
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
  const [name, setName] = useState(project?.name ?? "")
  const [description, setDescription] = useState(project?.description ?? "")
  const [clientId, setClientId] = useState(project?.client.id ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) { setError("Please select a client."); return }
    setSaving(true)
    setError("")

    const url = project ? `/api/projects/${project.id}` : "/api/projects"
    const method = project ? "PATCH" : "POST"
    const body = project
      ? { name, description: description || undefined }
      : { name, description: description || undefined, clientId }

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
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">{project ? "Edit Project" : "New Project"}</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
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
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : project ? "Save changes" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
