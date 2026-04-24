"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"

const CATEGORIES = [
  "Travel", "Accommodation", "Subsistence", "Equipment",
  "Software", "Training", "Communications", "Other",
]

const STATUS_OPTIONS = ["", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]

const statusClass: Record<string, string> = {
  DRAFT: "badge-draft",
  SUBMITTED: "badge-submitted",
  APPROVED: "badge-approved",
  REJECTED: "badge-rejected",
}

interface Client { id: string; name: string }

interface Expense {
  id: string
  description: string
  amount: string
  currency: string
  date: string
  category: string
  status: string
  client: { id: string; name: string } | null
}

export default function ExpensesPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === "ADMIN"

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("")
  const [showModal, setShowModal] = useState(false)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleteInProgress, setDeleteInProgress] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  async function load() {
    const qs = statusFilter ? `?status=${statusFilter}` : ""
    const [ex, cl] = await Promise.all([
      fetch(`/api/expenses${qs}`).then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ])
    setExpenses(ex)
    setClients(cl)
    setLoading(false)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteInProgress(true)
    const res = await fetch(`/api/expenses/${deleteTarget.id}`, { method: "DELETE" })
    setDeleteInProgress(false)
    if (res.status === 204) {
      setDeleteTarget(null)
      load()
    } else {
      const data = await res.json().catch(() => ({}))
      setDeleteError(data.error ?? "Failed to delete expense.")
    }
  }

  useEffect(() => { setLoading(true); load() }, [statusFilter])

  const total = expenses.reduce((sum, e) => sum + parseFloat(e.amount), 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
          <p className="text-sm text-gray-500 mt-1">
            {expenses.length} record{expenses.length !== 1 ? "s" : ""} · Total: £{total.toFixed(2)}
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setEditExpense(null); setShowModal(true) }}>
          Add expense
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
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

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">No expenses found.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Client</th>
                <th>Amount</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{new Date(e.date).toLocaleDateString("en-GB")}</td>
                  <td className="font-medium text-gray-900 max-w-xs truncate">{e.description}</td>
                  <td className="text-gray-500">{e.category}</td>
                  <td className="text-gray-500">{e.client?.name ?? "—"}</td>
                  <td className="font-mono text-sm">
                    {e.currency} {parseFloat(e.amount).toFixed(2)}
                  </td>
                  <td>
                    <span className={`badge ${statusClass[e.status] ?? "badge-draft"}`}>
                      {e.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-3">
                      {e.status === "DRAFT" && (
                        <button
                          onClick={() => { setEditExpense(e); setShowModal(true) }}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => { setDeleteTarget(e); setDeleteError("") }}
                          className="text-sm text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <ExpenseModal
          expense={editExpense}
          clients={clients}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}

      {deleteTarget && (
        <div className="modal-backdrop" onClick={() => { setDeleteTarget(null); setDeleteError("") }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 mb-2">Delete expense?</h3>
            {deleteTarget.status === "APPROVED" && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-sm text-amber-800">
                This expense is <strong>APPROVED</strong>. Deleting it may affect any associated invoice calculations.
              </div>
            )}
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{deleteError}</p>
            )}
            <p className="text-sm text-gray-600 mb-4">
              <span className="font-medium">{deleteTarget.description}</span> — {deleteTarget.currency} {parseFloat(deleteTarget.amount).toFixed(2)}
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setDeleteTarget(null); setDeleteError("") }} className="btn-secondary">Cancel</button>
              <button onClick={confirmDelete} disabled={deleteInProgress} className="btn-danger">
                {deleteInProgress ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ExpenseModal({
  expense,
  clients,
  onClose,
  onSaved,
}: {
  expense: Expense | null
  clients: Client[]
  onClose: () => void
  onSaved: () => void
}) {
  const [description, setDescription] = useState(expense?.description ?? "")
  const [amount, setAmount] = useState(expense?.amount ? parseFloat(expense.amount).toFixed(2) : "")
  const [currency, setCurrency] = useState(expense?.currency ?? "GBP")
  const [date, setDate] = useState(expense?.date ? expense.date.split("T")[0] : "")
  const [category, setCategory] = useState(expense?.category ?? "")
  const [clientId, setClientId] = useState(expense?.client?.id ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")

    const url = expense ? `/api/expenses/${expense.id}` : "/api/expenses"
    const method = expense ? "PATCH" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        amount: parseFloat(amount),
        currency,
        date: new Date(date).toISOString(),
        category,
        clientId: clientId || undefined,
      }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to save expense.")
      return
    }
    onSaved()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">{expense ? "Edit Expense" : "Add Expense"}</h2>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
          <div>
            <label className="label">Description *</label>
            <input type="text" className="input" required value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Date *</label>
              <input type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="label">Amount *</label>
              <input type="number" className="input" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option>GBP</option>
                <option>USD</option>
                <option>EUR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Category *</label>
              <select className="input" required value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select…</option>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Client (optional)</label>
              <select className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">None</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : expense ? "Save changes" : "Add expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
