"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"

type View = "totp" | "recovery"

export default function MfaPage() {
  const [view, setView] = useState<View>("totp")
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleTotp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.replace(/\s/g, ""), setup: false }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Invalid code. Please try again.")
      setCode("")
      return
    }

    router.push("/dashboard")
    router.refresh()
  }

  async function handleRecovery(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Invalid recovery code.")
      setCode("")
      return
    }

    const data = await res.json()
    if (data.warning) {
      // Show warning but still proceed
      console.warn(data.warning)
    }

    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h1>
          <p className="mt-1 text-sm text-gray-500">
            {view === "totp"
              ? "Enter the 6-digit code from your authenticator app."
              : "Enter one of your saved recovery codes."}
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={view === "totp" ? handleTotp : handleRecovery} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {view === "totp" ? (
              <div>
                <label htmlFor="code" className="label">Authenticator code</label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  placeholder="000000"
                  required
                  className="input text-center text-2xl tracking-widest"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={loading}
                />
              </div>
            ) : (
              <div>
                <label htmlFor="recovery" className="label">Recovery code</label>
                <input
                  id="recovery"
                  type="text"
                  autoComplete="off"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  required
                  className="input font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  disabled={loading}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (view === "totp" && code.length !== 6)}
              className="btn-primary w-full justify-center"
            >
              {loading ? "Verifying…" : "Verify"}
            </button>
          </form>

          <div className="mt-4 text-center">
            {view === "totp" ? (
              <button
                onClick={() => { setView("recovery"); setCode(""); setError("") }}
                className="text-sm text-blue-600 hover:underline"
              >
                Use a recovery code instead
              </button>
            ) : (
              <button
                onClick={() => { setView("totp"); setCode(""); setError("") }}
                className="text-sm text-blue-600 hover:underline"
              >
                Use authenticator app instead
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Sign out and use a different account
          </button>
        </div>
      </div>
    </div>
  )
}
