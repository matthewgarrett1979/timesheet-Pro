"use client"

import { useState, useEffect, Suspense } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"

interface OrgInfo {
  configured: boolean
  orgName: string | null
  domain: string | null
}

function LoginForm() {
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [org, setOrg]           = useState<OrgInfo | null>(null)

  const router       = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl  = searchParams.get("callbackUrl") ?? "/dashboard"
  const emailParam   = searchParams.get("email") ?? ""

  // Pre-fill email from URL param (set by setup wizard on completion)
  useEffect(() => {
    if (emailParam) setEmail(emailParam)
  }, [emailParam])

  // Fetch org info for display
  useEffect(() => {
    fetch("/api/setup")
      .then(r => r.json())
      .then((data: OrgInfo) => setOrg(data))
      .catch(() => {})
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await signIn("credentials", {
      email: email.toLowerCase().trim(),
      password,
      redirect: false,
    })

    setLoading(false)

    if (!res || res.error) {
      if (res?.error === "AccountLocked") {
        setError("Account locked after too many failed attempts. Try again in 15 minutes.")
      } else {
        setError("Invalid email or password.")
      }
      return
    }

    router.push(callbackUrl)
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Tech Timesheet</h1>
          {org?.orgName ? (
            <p className="mt-1 text-sm text-gray-500">Signing in to <span className="font-medium text-gray-700">{org.orgName}</span></p>
          ) : (
            <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>
          )}
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
              {org?.domain && (
                <p className="mt-1 text-xs text-gray-400">Use your <span className="font-mono">@{org.domain}</span> email address</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          This is a restricted internal system. Unauthorised access is prohibited.
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
