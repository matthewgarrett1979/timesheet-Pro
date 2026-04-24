"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"

interface OrgSettings {
  organizationDomain:      string | null
  domainVerifiedAt:        string | null
  domainVerificationToken: string | null
  licenceSeats:            number
  feature_po:              boolean
  feature_resource_planning: boolean
  feature_expenses:        boolean
  feature_xero:            boolean
  feature_onedrive:        boolean
  usedSeats:               number
}

export default function OrganisationSettingsPage() {
  const { data: session } = useSession()
  const [settings,    setSettings]    = useState<OrgSettings | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [verifying,   setVerifying]   = useState(false)
  const [msg,         setMsg]         = useState<{ ok: boolean; text: string } | null>(null)
  const [verifyMsg,   setVerifyMsg]   = useState<{ ok: boolean; text: string } | null>(null)

  const isAdmin = session?.user?.role === "ADMIN"

  useEffect(() => {
    if (!isAdmin) return
    fetch("/api/settings/organisation")
      .then(r => r.json())
      .then(d => setSettings(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isAdmin])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true); setMsg(null)
    const res = await fetch("/api/settings/organisation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        licenceSeats:             settings.licenceSeats,
        feature_po:               settings.feature_po,
        feature_resource_planning: settings.feature_resource_planning,
        feature_expenses:         settings.feature_expenses,
        feature_xero:             settings.feature_xero,
        feature_onedrive:         settings.feature_onedrive,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setMsg({ ok: true, text: "Organisation settings saved." })
    } else {
      const d = await res.json()
      setMsg({ ok: false, text: d.error ?? "Failed to save." })
    }
  }

  async function handleVerify() {
    setVerifying(true); setVerifyMsg(null)
    const res = await fetch("/api/settings/organisation/verify", { method: "POST" })
    const d   = await res.json()
    setVerifying(false)
    if (d.verified) {
      setVerifyMsg({ ok: true, text: "Domain verified successfully." })
      // Refresh settings to show updated domainVerifiedAt
      fetch("/api/settings/organisation")
        .then(r => r.json())
        .then(s => setSettings(s))
        .catch(() => {})
    } else {
      setVerifyMsg({ ok: false, text: d.error ?? "Verification failed." })
    }
  }

  function set<K extends keyof OrgSettings>(k: K, v: OrgSettings[K]) {
    setSettings(prev => prev ? { ...prev, [k]: v } : prev)
  }

  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          Only administrators can manage organisation settings.
        </p>
      </div>
    )
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>
  if (!settings) return <div className="p-6 text-sm text-red-500">Failed to load settings.</div>

  const domainVerified = !!settings.domainVerifiedAt
  const verifiedDate   = settings.domainVerifiedAt
    ? new Date(settings.domainVerifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null

  const features: { key: keyof OrgSettings; label: string; description: string }[] = [
    { key: "feature_po",               label: "Purchase Orders",      description: "Track POs against projects" },
    { key: "feature_resource_planning",label: "Resource Planning",    description: "Calendar-based team scheduling" },
    { key: "feature_expenses",         label: "Expense Management",   description: "Log and approve expense claims" },
    { key: "feature_xero",             label: "Xero Integration",     description: "Sync invoices to Xero" },
    { key: "feature_onedrive",         label: "OneDrive Integration", description: "Attach documents from OneDrive" },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Organisation</h1>

      {/* Domain section — read-only */}
      <div className="card p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-800">Domain</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Organisation domain</p>
            <p className="mt-1 font-mono text-sm text-gray-900">
              {settings.organizationDomain ?? <span className="text-gray-400 italic">Not configured</span>}
            </p>
          </div>
          {settings.organizationDomain && (
            <span className={`badge ${domainVerified ? "badge-approved" : "badge-draft"}`}>
              {domainVerified ? "Verified" : "Unverified"}
            </span>
          )}
        </div>

        {domainVerified && verifiedDate && (
          <p className="text-xs text-gray-400">Verified on {verifiedDate}</p>
        )}

        {!domainVerified && settings.organizationDomain && settings.domainVerificationToken && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
            <p className="text-sm font-medium text-amber-800">Domain not yet verified</p>
            <p className="text-xs text-amber-700">
              Add this TXT record to your DNS for <span className="font-mono">{settings.organizationDomain}</span>:
            </p>
            <code className="block text-xs font-mono bg-white border border-amber-200 rounded px-3 py-2 break-all">
              tech-timesheet-verify={settings.domainVerificationToken}
            </code>
            <p className="text-xs text-amber-600">DNS propagation can take up to 48 hours.</p>
          </div>
        )}

        {settings.organizationDomain && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="btn-secondary btn text-sm"
            >
              {verifying ? "Checking DNS…" : "Re-verify domain"}
            </button>
            {verifyMsg && (
              <span className={`text-sm ${verifyMsg.ok ? "text-green-600" : "text-red-600"}`}>
                {verifyMsg.text}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Licence & features — editable */}
      <form onSubmit={handleSave} className="space-y-6">
        <div className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Licence</h2>

          <div className="flex items-end gap-6">
            <div>
              <label className="label">User seats</label>
              <input
                type="number"
                className="input w-32"
                min={1}
                max={9999}
                value={settings.licenceSeats}
                onChange={e => set("licenceSeats", Math.max(1, parseInt(e.target.value) || 1))}
              />
              <p className="text-xs text-gray-400 mt-1">Maximum number of user accounts.</p>
            </div>
            <div className="pb-5">
              <span className="text-sm text-gray-500">
                {settings.usedSeats} / {settings.licenceSeats} used
              </span>
            </div>
          </div>
        </div>

        <div className="card p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-800">Features</h2>
          <div className="space-y-3">
            {features.map(({ key, label, description }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!settings[key]}
                  onChange={e => set(key, e.target.checked as OrgSettings[typeof key])}
                  className="mt-0.5 rounded border-gray-300"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500">{description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {msg && (
          <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
        )}

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save organisation settings"}
        </button>
      </form>
    </div>
  )
}
