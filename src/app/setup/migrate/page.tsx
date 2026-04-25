"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MigrateState {
  // Step 1 — domain
  domain:            string
  verificationToken: string
  domainVerified:    boolean
  // Step 2 — org details
  companyName:         string
  companyLegalName:    string
  companyAddress:      string
  companyPhone:        string
  vatNumber:           string
  vatRegistered:       boolean
  companyRegNumber:    string
  // Step 3 — licence
  licenceSeats:             number
  featurePO:                boolean
  featureResourcePlanning:  boolean
  featureExpenses:          boolean
  featureXero:              boolean
  featureOnedrive:          boolean
}

function emptyState(): MigrateState {
  return {
    domain: "", verificationToken: "", domainVerified: false,
    companyName: "", companyLegalName: "", companyAddress: "",
    companyPhone: "", vatNumber: "", vatRegistered: false, companyRegNumber: "",
    licenceSeats: 5,
    featurePO: true, featureResourcePlanning: true, featureExpenses: true,
    featureXero: false, featureOnedrive: false,
  }
}

function generateToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32)
}

const STEP_LABELS = ["Domain", "Organisation", "Licence", "Complete"]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MigratePage() {
  const router  = useRouter()
  const { update } = useSession()
  const [step,     setStep]     = useState(1)
  const [state,    setState]    = useState<MigrateState>(emptyState)
  const [loading,  setLoading]  = useState(true)

  // Load pre-fill data from the server
  useEffect(() => {
    fetch("/api/setup/migrate")
      .then(r => {
        if (r.status === 401 || r.status === 403) {
          // Not an ADMIN — redirect to dashboard
          router.replace("/dashboard")
          return null
        }
        return r.json()
      })
      .then(data => {
        if (!data) return
        setState(prev => ({
          ...prev,
          domain:                  data.detectedDomain          ?? "",
          companyName:             data.companyName             ?? "",
          companyLegalName:        data.companyLegalName        ?? "",
          companyAddress:          data.companyAddress          ?? "",
          companyPhone:            data.companyPhone            ?? "",
          vatNumber:               data.vatNumber               ?? "",
          vatRegistered:           data.vatRegistered           ?? false,
          companyRegNumber:        data.companyRegNumber        ?? "",
          licenceSeats:            data.licenceSeats            ?? 5,
          featurePO:               data.feature_po              ?? true,
          featureResourcePlanning: data.feature_resource_planning ?? true,
          featureExpenses:         data.feature_expenses         ?? true,
          featureXero:             data.feature_xero             ?? false,
          featureOnedrive:         data.feature_onedrive         ?? false,
        }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [router])

  function set<K extends keyof MigrateState>(key: K, value: MigrateState[K]) {
    setState(prev => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading migration wizard…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Tech Timesheet</h1>
          <p className="mt-2 text-slate-300">Domain configuration — existing instance</p>
          <p className="mt-1 text-slate-400 text-sm">
            Your instance needs a verified domain before you can continue. This does not affect any existing data.
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-between mb-8">
          {STEP_LABELS.map((label, i) => {
            const n         = i + 1
            const active    = n === step
            const completed = n < step
            return (
              <div key={n} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                    completed ? "bg-green-500 border-green-500 text-white"
                    : active   ? "bg-white border-white text-slate-900"
                    :            "bg-transparent border-slate-500 text-slate-400"
                  }`}>
                    {completed ? "✓" : n}
                  </div>
                  <p className={`mt-1 text-xs font-medium ${active ? "text-white" : completed ? "text-green-400" : "text-slate-500"}`}>
                    {label}
                  </p>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mt-[-12px] ${completed ? "bg-green-500" : "bg-slate-600"}`} />
                )}
              </div>
            )
          })}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          {step === 1 && <MigrateStep1Domain  state={state} set={set} onNext={() => setStep(2)} />}
          {step === 2 && <MigrateStep2Org     state={state} set={set} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <MigrateStep3Licence state={state} set={set} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
          {step === 4 && <MigrateStep4Complete state={state} onBack={() => setStep(3)} update={update} />}
        </div>
      </div>
    </div>
  )
}

// ─── Step 1: Domain ───────────────────────────────────────────────────────────

function MigrateStep1Domain({
  state, set, onNext,
}: { state: MigrateState; set: <K extends keyof MigrateState>(k: K, v: MigrateState[K]) => void; onNext: () => void }) {
  const [verifying, setVerifying] = useState(false)
  const [error,     setError]     = useState("")

  function generateNew() {
    set("verificationToken", generateToken())
    set("domainVerified", false)
    setError("")
  }

  async function verifyDomain() {
    if (!state.domain.trim() || !state.verificationToken) return
    setVerifying(true)
    setError("")
    try {
      const res  = await fetch("/api/setup/verify-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: state.domain.trim().toLowerCase(), token: state.verificationToken }),
      })
      const data = await res.json()
      if (data.verified) {
        set("domainVerified", true)
        set("domain", state.domain.trim().toLowerCase())
      } else {
        setError(data.error ?? "Verification failed.")
      }
    } catch {
      setError("Network error — please try again.")
    }
    setVerifying(false)
  }

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Domain Verification</h2>
      <p className="text-sm text-gray-500 mb-6">
        Verify ownership of your organisation&apos;s domain via a DNS TXT record. The value below was detected from your email address — update it if needed.
      </p>

      <div className="space-y-4">
        <div>
          <label className="label">Organisation domain</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. example.com"
            value={state.domain}
            onChange={e => { set("domain", e.target.value); set("domainVerified", false); set("verificationToken", "") }}
          />
        </div>

        {state.domain && !state.verificationToken && (
          <button onClick={generateNew} className="btn-secondary btn text-sm">
            Generate verification token
          </button>
        )}

        {state.verificationToken && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Add this TXT record to your DNS:</p>
            <div className="space-y-2 text-sm">
              <div className="flex gap-3">
                <span className="text-slate-500 w-16 shrink-0">Host:</span>
                <code className="font-mono bg-white border border-slate-200 rounded px-2 py-0.5">@</code>
                <span className="text-slate-400 text-xs self-center">(or your domain root)</span>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-slate-500 w-16 shrink-0 mt-1">Value:</span>
                <code className="font-mono bg-white border border-slate-200 rounded px-2 py-1 text-xs break-all flex-1">
                  tech-timesheet-verify={state.verificationToken}
                </code>
              </div>
            </div>
            <p className="text-xs text-slate-400">DNS propagation can take up to 48 hours.</p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
        )}

        {state.domainVerified && (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 text-sm">
            <span>✓</span>
            <span>Domain <strong>{state.domain}</strong> verified successfully.</span>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          {state.verificationToken && !state.domainVerified && (
            <>
              <button
                onClick={verifyDomain}
                disabled={verifying || !state.domain.trim()}
                className="btn-primary btn"
              >
                {verifying ? "Verifying…" : "Verify DNS"}
              </button>
              <button onClick={generateNew} className="btn-secondary btn text-sm">
                New token
              </button>
            </>
          )}
          {state.domainVerified && (
            <button onClick={onNext} className="btn-primary btn">
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Step 2: Organisation Details ─────────────────────────────────────────────

function MigrateStep2Org({
  state, set, onNext, onBack,
}: { state: MigrateState; set: <K extends keyof MigrateState>(k: K, v: MigrateState[K]) => void; onNext: () => void; onBack: () => void }) {
  const canContinue = state.companyName.trim().length > 0

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Organisation Details</h2>
      <p className="text-sm text-gray-500 mb-6">Confirm or update your organisation information. This information appears on invoices and documents.</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Company name <span className="text-red-500">*</span></label>
          <input type="text" className="input" value={state.companyName} onChange={e => set("companyName", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Legal name (if different)</label>
          <input type="text" className="input" value={state.companyLegalName} onChange={e => set("companyLegalName", e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Company address</label>
          <textarea className="input" rows={3} value={state.companyAddress} onChange={e => set("companyAddress", e.target.value)} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input type="tel" className="input" value={state.companyPhone} onChange={e => set("companyPhone", e.target.value)} />
        </div>
        <div>
          <label className="label">Company registration number</label>
          <input type="text" className="input font-mono" value={state.companyRegNumber} onChange={e => set("companyRegNumber", e.target.value)} />
        </div>
        <div>
          <label className="label">VAT number</label>
          <input type="text" className="input font-mono" value={state.vatNumber} onChange={e => set("vatNumber", e.target.value)} />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <input type="checkbox" id="vatReg" checked={state.vatRegistered} onChange={e => set("vatRegistered", e.target.checked)} className="rounded border-gray-300" />
          <label htmlFor="vatReg" className="text-sm text-gray-700">VAT registered</label>
        </div>
      </div>

      <div className="flex gap-3 pt-6">
        <button onClick={onBack} className="btn-secondary btn">Back</button>
        <button onClick={onNext} disabled={!canContinue} className="btn-primary btn">Continue</button>
      </div>
    </div>
  )
}

// ─── Step 3: Licence ──────────────────────────────────────────────────────────

function MigrateStep3Licence({
  state, set, onNext, onBack,
}: { state: MigrateState; set: <K extends keyof MigrateState>(k: K, v: MigrateState[K]) => void; onNext: () => void; onBack: () => void }) {
  const features: { key: keyof MigrateState; label: string; description: string }[] = [
    { key: "featurePO",               label: "Purchase Orders",      description: "Track POs against projects" },
    { key: "featureResourcePlanning", label: "Resource Planning",    description: "Calendar-based team scheduling" },
    { key: "featureExpenses",         label: "Expense Management",   description: "Log and approve expense claims" },
    { key: "featureXero",             label: "Xero Integration",     description: "Sync invoices to Xero" },
    { key: "featureOnedrive",         label: "OneDrive Integration", description: "Attach documents from OneDrive" },
  ]

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Licence Configuration</h2>
      <p className="text-sm text-gray-500 mb-6">Review and confirm your seat count and feature set.</p>

      <div className="space-y-6">
        <div>
          <label className="label">User seats</label>
          <input
            type="number"
            className="input w-32"
            min={1}
            max={9999}
            value={state.licenceSeats}
            onChange={e => set("licenceSeats", Math.max(1, parseInt(e.target.value) || 1))}
          />
          <p className="text-xs text-gray-400 mt-1">Maximum number of user accounts.</p>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Features</p>
          <div className="space-y-3">
            {features.map(({ key, label, description }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!state[key]}
                  onChange={e => set(key, e.target.checked as MigrateState[typeof key])}
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
      </div>

      <div className="flex gap-3 pt-6">
        <button onClick={onBack} className="btn-secondary btn">Back</button>
        <button onClick={onNext} className="btn-primary btn">Review &amp; Complete</button>
      </div>
    </div>
  )
}

// ─── Step 4: Complete ─────────────────────────────────────────────────────────

function MigrateStep4Complete({
  state, onBack, update,
}: {
  state: MigrateState
  onBack: () => void
  update: (data: Record<string, unknown>) => Promise<unknown>
}) {
  const router  = useRouter()
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState("")

  async function complete() {
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/setup/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain:            state.domain,
          verificationToken: state.verificationToken,
          companyName:       state.companyName,
          companyLegalName:  state.companyLegalName  || undefined,
          companyAddress:    state.companyAddress    || undefined,
          companyPhone:      state.companyPhone      || undefined,
          vatNumber:         state.vatNumber         || undefined,
          vatRegistered:     state.vatRegistered,
          companyRegNumber:  state.companyRegNumber  || undefined,
          licenceSeats:      state.licenceSeats,
          features: {
            po:               state.featurePO,
            resourcePlanning: state.featureResourcePlanning,
            expenses:         state.featureExpenses,
            xero:             state.featureXero,
            onedrive:         state.featureOnedrive,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Migration failed. Please try again.")
        setSaving(false)
        return
      }
      // Clear the needsMigration flag from the JWT so middleware stops redirecting
      await update({ needsMigration: false })
      router.push("/dashboard")
    } catch {
      setError("Network error — please try again.")
      setSaving(false)
    }
  }

  const enabledFeatures = [
    state.featurePO               && "Purchase Orders",
    state.featureResourcePlanning && "Resource Planning",
    state.featureExpenses         && "Expense Management",
    state.featureXero             && "Xero Integration",
    state.featureOnedrive         && "OneDrive Integration",
  ].filter(Boolean) as string[]

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Ready to Complete</h2>
      <p className="text-sm text-gray-500 mb-6">
        Review the configuration below. Existing users, projects, and time entries will not be affected.
      </p>

      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-sm">
          <SummaryRow label="Domain"       value={state.domain} mono />
          <SummaryRow label="Organisation" value={state.companyName} />
          <SummaryRow label="User seats"   value={String(state.licenceSeats)} />
          <SummaryRow label="Features"     value={enabledFeatures.length ? enabledFeatures.join(", ") : "None enabled"} />
        </div>

        <div className="rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
          <strong>Note:</strong> All existing users must have <span className="font-mono">@{state.domain}</span> email addresses. New users will be restricted to this domain.
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-6">
        <button onClick={onBack} disabled={saving} className="btn-secondary btn">Back</button>
        <button onClick={complete} disabled={saving} className="btn-primary btn px-6">
          {saving ? "Completing migration…" : "Complete Migration"}
        </button>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between px-4 py-2.5">
      <span className="text-slate-500">{label}</span>
      <span className={`text-slate-800 font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  )
}
