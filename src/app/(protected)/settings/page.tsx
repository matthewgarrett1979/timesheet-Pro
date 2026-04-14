"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"

type MfaStep = "idle" | "qr" | "verify" | "done"

export default function SettingsPage() {
  const { data: session, update } = useSession()
  const router = useRouter()

  // Profile
  const [name, setName] = useState("")
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Password
  const [currentPw, setCurrentPw] = useState("")
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // MFA setup
  const [mfaStep, setMfaStep] = useState<MfaStep>("idle")
  const [qrCode, setQrCode] = useState("")
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [totpCode, setTotpCode] = useState("")
  const [mfaLoading, setMfaLoading] = useState(false)
  const [mfaError, setMfaError] = useState("")

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name)
  }, [session?.user?.name])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileMsg(null)

    const res = await fetch(`/api/users/${session?.user?.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })

    setProfileSaving(false)
    if (res.ok) {
      await update()
      setProfileMsg({ ok: true, text: "Profile updated." })
    } else {
      const data = await res.json()
      setProfileMsg({ ok: false, text: data.error ?? "Failed to save." })
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: "New passwords do not match." })
      return
    }
    if (newPw.length < 12) {
      setPwMsg({ ok: false, text: "Password must be at least 12 characters." })
      return
    }
    setPwSaving(true)
    setPwMsg(null)

    const res = await fetch(`/api/users/${session?.user?.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    })

    setPwSaving(false)
    if (res.ok) {
      setPwMsg({ ok: true, text: "Password changed successfully." })
      setCurrentPw(""); setNewPw(""); setConfirmPw("")
    } else {
      const data = await res.json()
      setPwMsg({ ok: false, text: data.error ?? "Failed to change password." })
    }
  }

  async function startMfaSetup() {
    setMfaLoading(true)
    setMfaError("")

    const res = await fetch("/api/auth/mfa/setup", { method: "POST" })
    setMfaLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setMfaError(data.error ?? "Failed to start MFA setup.")
      return
    }

    const data = await res.json()
    setQrCode(data.qrCode)
    setRecoveryCodes(data.recoveryCodes)
    setMfaStep("qr")
  }

  async function verifyMfaSetup(e: React.FormEvent) {
    e.preventDefault()
    setMfaLoading(true)
    setMfaError("")

    const res = await fetch("/api/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: totpCode, setup: true }),
    })

    setMfaLoading(false)

    if (!res.ok) {
      const data = await res.json()
      setMfaError(data.error ?? "Invalid code.")
      setTotpCode("")
      return
    }

    await update()
    setMfaStep("done")
  }

  const mfaEnabled = session?.user?.mfaEnabled ?? false

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      {/* Profile section */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Profile</h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="label">Full name</label>
            <input
              type="text"
              className="input max-w-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Email address</label>
            <input
              type="email"
              className="input max-w-sm"
              value={session?.user?.email ?? ""}
              disabled
            />
            <p className="text-xs text-gray-400 mt-1">Contact an administrator to change your email.</p>
          </div>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.ok ? "text-green-600" : "text-red-600"}`}>{profileMsg.text}</p>
          )}
          <button type="submit" disabled={profileSaving} className="btn-primary">
            {profileSaving ? "Saving…" : "Save profile"}
          </button>
        </form>
      </div>

      {/* Password section */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Change Password</h2>
        <form onSubmit={changePassword} className="space-y-4 max-w-sm">
          <div>
            <label className="label">Current password</label>
            <input
              type="password"
              className="input"
              autoComplete="current-password"
              required
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
          </div>
          <div>
            <label className="label">New password</label>
            <input
              type="password"
              className="input"
              autoComplete="new-password"
              minLength={12}
              required
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input
              type="password"
              className="input"
              autoComplete="new-password"
              minLength={12}
              required
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
            />
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.ok ? "text-green-600" : "text-red-600"}`}>{pwMsg.text}</p>
          )}
          <button type="submit" disabled={pwSaving} className="btn-primary">
            {pwSaving ? "Changing…" : "Change password"}
          </button>
        </form>
      </div>

      {/* MFA section */}
      <div className="card p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-1">Two-Factor Authentication</h2>

        {mfaEnabled ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="badge badge-approved">Enabled</span>
              <p className="text-sm text-gray-600">
                Your account is protected with an authenticator app.
              </p>
            </div>
            <p className="text-sm text-gray-400">
              To disable or regenerate recovery codes, contact your administrator.
            </p>
          </div>
        ) : mfaStep === "idle" ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="badge badge-draft">Not enabled</span>
              <p className="text-sm text-gray-600">
                Add an extra layer of security to your account.
              </p>
            </div>
            {mfaError && <p className="text-sm text-red-600 mb-3">{mfaError}</p>}
            <button onClick={startMfaSetup} disabled={mfaLoading} className="btn-primary">
              {mfaLoading ? "Setting up…" : "Enable MFA"}
            </button>
          </div>
        ) : mfaStep === "qr" ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.),
              then enter the 6-digit code to activate.
            </p>
            {qrCode && (
              <img src={qrCode} alt="MFA QR code" className="border rounded-lg p-2 w-48 h-48" />
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-800 mb-2">
                Save these recovery codes now — they will not be shown again.
              </p>
              <div className="grid grid-cols-2 gap-1">
                {recoveryCodes.map((code) => (
                  <code key={code} className="text-xs font-mono bg-white border border-amber-200 rounded px-2 py-1">
                    {code}
                  </code>
                ))}
              </div>
            </div>

            <form onSubmit={verifyMfaSetup} className="space-y-3">
              <div>
                <label className="label">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  placeholder="000000"
                  className="input w-40 text-center text-xl tracking-widest"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                />
              </div>
              {mfaError && <p className="text-sm text-red-600">{mfaError}</p>}
              <div className="flex gap-3">
                <button type="submit" disabled={mfaLoading || totpCode.length !== 6} className="btn-primary">
                  {mfaLoading ? "Verifying…" : "Activate MFA"}
                </button>
                <button type="button" onClick={() => setMfaStep("idle")} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="badge badge-approved">MFA activated</span>
            <p className="text-sm text-green-700">Your account is now protected. You will be prompted on next login.</p>
          </div>
        )}
      </div>
    </div>
  )
}
