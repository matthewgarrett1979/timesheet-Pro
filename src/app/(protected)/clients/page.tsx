"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

interface Client {
  id: string
  name: string
  reference: string | null
  createdAt: string
}

export default function ClientsPage() {
  const { data: session } = useSession()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)

  async function load() {
    const res = await fetch("/api/clients")
    if (res.ok) setClients(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditClient(null); setShowModal(true) }}>
          New client
        </button>
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No clients yet. Add your first client to get started.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Reference</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium text-gray-900">{c.name}</td>
                  <td className="text-gray-500 font-mono text-xs">{c.reference ?? "—"}</td>
                  <td className="text-gray-400">{new Date(c.createdAt).toLocaleDateString("en-GB")}</td>
                  <td>
                    <button
                      onClick={() => { setEditClient(c); setShowModal(true) }}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ClientModal
          client={editClient}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function ClientModal({
  client,
  onClose,
  onSaved,
}: {
  client: Client | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(client?.name ?? "")
  const [reference, setReference] = useState(client?.reference ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")

    const url = client ? `/api/clients/${client.id}` : "/api/clients"
    const method = client ? "PATCH" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, reference: reference || undefined }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to save client.")
      return
    }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">{client ? "Edit Client" : "New Client"}</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
          <div>
            <label className="label">Client name *</label>
            <input
              type="text"
              className="input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Reference (optional)</label>
            <input
              type="text"
              className="input font-mono"
              placeholder="e.g. GD-2024-001"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : client ? "Save changes" : "Create client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
