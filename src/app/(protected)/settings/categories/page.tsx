"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

interface Category {
  id: string
  name: string
  colour: string
  isBillable: boolean
  sortOrder: number
}

export default function CategoriesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Add form
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({
    name: "",
    colour: "#3b82f6",
    isBillable: true,
    sortOrder: 0,
  })
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState("")

  // Edit form
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({
    name: "",
    colour: "#3b82f6",
    isBillable: true,
    sortOrder: 0,
  })
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState("")

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role !== "ADMIN") {
      router.replace("/dashboard")
    }
  }, [status, session, router])

  async function load() {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/categories")
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      setCategories(Array.isArray(data) ? data : [])
    } catch {
      setError("Failed to load categories.")
    }
    setLoading(false)
  }

  useEffect(() => {
    if (status === "authenticated" && session?.user?.role === "ADMIN") {
      load()
    }
  }, [status, session])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.name.trim()) { setAddError("Name is required."); return }
    setAddLoading(true)
    setAddError("")
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name.trim(),
          colour: addForm.colour,
          isBillable: addForm.isBillable,
          sortOrder: Number(addForm.sortOrder),
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setAddError(d.error ?? "Failed to create.")
      } else {
        setShowAdd(false)
        setAddForm({ name: "", colour: "#3b82f6", isBillable: true, sortOrder: 0 })
        load()
      }
    } catch {
      setAddError("Network error.")
    }
    setAddLoading(false)
  }

  function startEdit(cat: Category) {
    setEditId(cat.id)
    setEditForm({
      name: cat.name,
      colour: cat.colour,
      isBillable: cat.isBillable,
      sortOrder: cat.sortOrder,
    })
    setEditError("")
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editId) return
    if (!editForm.name.trim()) { setEditError("Name is required."); return }
    setEditLoading(true)
    setEditError("")
    try {
      const res = await fetch(`/api/categories/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editForm.name.trim(),
          colour: editForm.colour,
          isBillable: editForm.isBillable,
          sortOrder: Number(editForm.sortOrder),
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setEditError(d.error ?? "Failed to update.")
      } else {
        setEditId(null)
        load()
      }
    } catch {
      setEditError("Network error.")
    }
    setEditLoading(false)
  }

  async function handleDelete(id: string) {
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" })
      if (res.ok) {
        setDeleteId(null)
        load()
      }
    } catch {
      // ignore
    }
    setDeleteLoading(false)
  }

  if (status === "loading") {
    return <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
  }

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="bg-amber-50 border border-amber-200 rounded p-4">
          <p className="text-sm text-amber-800">Admin access required.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time Categories</h1>
          <p className="text-sm text-gray-500 mt-1">Manage categories used when logging time entries.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setShowAdd(true); setAddError("") }}
        >
          Add Category
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">New Category</h3>
          <form onSubmit={handleAdd} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="label">Name *</label>
              <input
                type="text"
                className="input"
                required
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Development"
              />
            </div>
            <div>
              <label className="label">Colour</label>
              <input
                type="color"
                className="input h-10 w-16 p-1 cursor-pointer"
                value={addForm.colour}
                onChange={(e) => setAddForm((f) => ({ ...f, colour: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Sort Order</label>
              <input
                type="number"
                className="input w-24"
                value={addForm.sortOrder}
                min={0}
                onChange={(e) => setAddForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                id="add-billable"
                checked={addForm.isBillable}
                onChange={(e) => setAddForm((f) => ({ ...f, isBillable: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="add-billable" className="text-sm text-gray-700">Billable</label>
            </div>
            {addError && (
              <p className="w-full text-sm text-red-600">{addError}</p>
            )}
            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary text-sm" disabled={addLoading}>
                {addLoading ? "Saving…" : "Create"}
              </button>
              <button
                type="button"
                className="btn btn-secondary text-sm"
                onClick={() => { setShowAdd(false); setAddError("") }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : categories.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No categories yet. Add your first category above.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Colour</th>
                <th>Name</th>
                <th>Billable</th>
                <th className="text-right">Sort Order</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...categories]
                .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                .map((cat) => {
                  if (editId === cat.id) {
                    return (
                      <tr key={cat.id}>
                        <td colSpan={5} className="py-3 px-4 bg-blue-50">
                          <form onSubmit={handleEdit} className="flex flex-wrap gap-3 items-end">
                            <div>
                              <label className="label">Name *</label>
                              <input
                                type="text"
                                className="input"
                                required
                                value={editForm.name}
                                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="label">Colour</label>
                              <input
                                type="color"
                                className="input h-10 w-16 p-1 cursor-pointer"
                                value={editForm.colour}
                                onChange={(e) => setEditForm((f) => ({ ...f, colour: e.target.value }))}
                              />
                            </div>
                            <div>
                              <label className="label">Sort Order</label>
                              <input
                                type="number"
                                className="input w-24"
                                value={editForm.sortOrder}
                                min={0}
                                onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                              />
                            </div>
                            <div className="flex items-center gap-2 pb-1">
                              <input
                                type="checkbox"
                                id={`edit-billable-${cat.id}`}
                                checked={editForm.isBillable}
                                onChange={(e) => setEditForm((f) => ({ ...f, isBillable: e.target.checked }))}
                                className="rounded border-gray-300"
                              />
                              <label htmlFor={`edit-billable-${cat.id}`} className="text-sm text-gray-700">Billable</label>
                            </div>
                            {editError && (
                              <p className="w-full text-sm text-red-600">{editError}</p>
                            )}
                            <div className="flex gap-2">
                              <button type="submit" className="btn btn-primary text-xs" disabled={editLoading}>
                                {editLoading ? "Saving…" : "Save"}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary text-xs"
                                onClick={() => { setEditId(null); setEditError("") }}
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
                    <tr key={cat.id}>
                      <td>
                        <div
                          className="w-6 h-6 rounded-full border border-gray-200"
                          style={{ backgroundColor: cat.colour }}
                          title={cat.colour}
                        />
                      </td>
                      <td className="font-medium text-gray-900">{cat.name}</td>
                      <td>
                        <span className={`badge ${cat.isBillable ? "badge-approved" : "badge-draft"}`}>
                          {cat.isBillable ? "Billable" : "Non-billable"}
                        </span>
                      </td>
                      <td className="text-right text-gray-500 font-mono">{cat.sortOrder}</td>
                      <td className="space-x-3 whitespace-nowrap">
                        <button
                          onClick={() => startEdit(cat)}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Edit
                        </button>
                        {deleteId === cat.id ? (
                          <>
                            <span className="text-xs text-gray-500">Delete?</span>
                            <button
                              onClick={() => handleDelete(cat.id)}
                              disabled={deleteLoading}
                              className="text-sm text-red-600 hover:underline"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteId(null)}
                              className="text-sm text-gray-400 hover:underline"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setDeleteId(cat.id)}
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
