"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

export default function ChangePasswordPage() {
  const { data: session, update } = useSession()
  const router = useRouter()

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  const isMustChange = session?.user?.mustChangePassword === true

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (newPassword.length < 14) {
      setError("New password must be at least 14 characters.")
      return
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setSaving(true)

    const res = await fetch(`/api/users/${session?.user?.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    })

    setSaving(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Failed to change password.")
      return
    }

    // Update the session token to clear mustChangePassword
    await update({ mustChangePassword: false })

    setSuccess(true)
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")

    // Redirect role-appropriately after a brief pause
    const dest = session?.user?.role === "USER" ? "/time-entries" : "/dashboard"
    setTimeout(() => {
      router.push(dest)
    }, 1500)
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Change Password</h1>
        {isMustChange && (
          <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            You must set a new password before continuing. Please choose a strong password of at least 14 characters.
          </p>
        )}
        {!isMustChange && (
          <p className="text-sm text-gray-500 mt-1">Choose a strong password of at least 14 characters.</p>
        )}
      </div>

      <div className="card p-6">
        {success ? (
          <div className="text-center py-4">
            <p className="text-green-700 font-medium">Password changed successfully.</p>
            <p className="text-sm text-gray-500 mt-1">Redirecting…</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
            )}

            <div>
              <label className="label">Current password *</label>
              <input
                type="password"
                className="input"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            <div>
              <label className="label">New password *</label>
              <input
                type="password"
                className="input"
                required
                minLength={14}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
              <p className="text-xs text-gray-400 mt-1">Minimum 14 characters.</p>
            </div>

            <div>
              <label className="label">Confirm new password *</label>
              <input
                type="password"
                className="input"
                required
                minLength={14}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              {!isMustChange && (
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              )}
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving…" : "Change password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
