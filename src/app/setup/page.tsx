"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

// ─── Types ────────────────────────────────────────────────────────────────────

interface WizardState {
  // Step 1
  domain:              string
  verificationToken:   string
  domainVerified:      boolean
  // Step 2
  companyName:         string
  companyLegalName:    string
  companyAddress:      string
  companyPhone:        string
  vatNumber:           string
  vatRegistered:       boolean
  companyRegNumber:    string
  // Step 3
  adminName:           string
  adminEmail:          string
  adminPassword:       string
  adminConfirmPassword: string
  // Step 4
  licenceSeats:        number
  featurePO:           boolean
  featureResourcePlanning: boolean
  featureExpenses:     boolean
  featureXero:         boolean
  featureOnedrive:     boolean
}

function emptyState(): WizardState {
  return {
    domain: "", verificationToken: "", domainVerified: false,
    companyName: "", companyLegalName: "", companyAddress: "",
    companyPhone: "", vatNumber: "", vatRegistered: false, companyRegNumber: "",
    adminName: "", adminEmail: "", adminPassword: "", adminConfirmPassword: "",
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

function validatePassword(pw: string): string[] {
  const errors: string[] = []
  if (pw.length < 14)          errors.push("At least 14 characters")
  if (!/[A-Z]/.test(pw))       errors.push("At least one uppercase letter")
  if (!/[a-z]/.test(pw))       errors.push("At least one lowercase letter")
  if (!/[0-9]/.test(pw))       errors.push("At least one number")
  if (!/[^A-Za-z0-9]/.test(pw)) errors.push("At least one special character")
  return errors
}

const STEP_LABELS = [
  "Domain",
  "Organisation",
  "Admin User",
  "Licence",
  "Complete",
]

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [state, setState] = useState<WizardState>(emptyState)
  const [checking, setChecking] = useState(true)

  // If already configured, redirect to dashboard
  useEffect(() => {
    fetch("/api/setup")
      .then(r => r.json())
      .then(data => {
        if (data.configured) router.replace("/dashboard")
        else setChecking(false)
      })
      .catch(() => setChecking(false))
  }, [router])

  function set<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState(prev => ({ ...prev, [key]: value }))
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Checking setup status…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-700 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Tech Timesheet</h1>
          <p className="mt-2 text-slate-300">First-time setup wizard</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-between mb-8">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1
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
          {step === 1 && <Step1Domain state={state} set={set} onNext={() => setStep(2)} />}
          {step === 2 && <Step2Org    state={state} set={set} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
          {step === 3 && <Step3Admin  state={state} set={set} onNext={() => setStep(4)} onBack={() => setStep(2)} />}
          {step === 4 && <Step4Licence state={state} set={set} onNext={() => setStep(5)} onBack={() => setStep(3)} />}
          {step === 5 && <Step5Complete state={state} onBack={() => setStep(4)} />}
        </div>
      </div>
    </div>
  )
}

// ─── Step 1: Domain ───────────────────────────────────────────────────────────

function Step1Domain({
  state, set, onNext,
}: { state: WizardState; set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; onNext: () => void }) {
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState("")

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
      <h2 className="text-xl font-bold text-gray-900 mb-1">Domain Registration</h2>
      <p className="text-sm text-gray-500 mb-6">
        Verify ownership of your organisation&apos;s domain via a DNS TXT record.
      </p>

      <div className="space-y-4">
        <div>
          <label className="label">Organisation domain</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. tech-timesheet.com"
            value={state.domain}
            onChange={e => { set("domain", e.target.value); set("domainVerified", false) }}
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
            <button
              onClick={verifyDomain}
              disabled={verifying || !state.domain.trim()}
              className="btn-primary btn"
            >
              {verifying ? "Verifying…" : "Verify DNS"}
            </button>
          )}
          {state.verificationToken && !state.domainVerified && (
            <button onClick={generateNew} className="btn-secondary btn text-sm">
              New token
            </button>
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

function Step2Org({
  state, set, onNext, onBack,
}: { state: WizardState; set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; onNext: () => void; onBack: () => void }) {
  const canContinue = state.companyName.trim().length > 0

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Organisation Details</h2>
      <p className="text-sm text-gray-500 mb-6">This information appears on invoices and documents.</p>

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

// ─── Step 3: Admin User ───────────────────────────────────────────────────────

function Step3Admin({
  state, set, onNext, onBack,
}: { state: WizardState; set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; onNext: () => void; onBack: () => void }) {
  const pwErrors             = validatePassword(state.adminPassword)
  const emailDomain          = state.adminEmail.split("@")[1]?.toLowerCase() ?? ""
  const actualDomainMismatch = state.adminEmail.includes("@") && emailDomain !== state.domain
  const passwordMatch        = state.adminPassword === state.adminConfirmPassword
  const canContinue          = (
    state.adminName.trim() &&
    state.adminEmail.trim() &&
    !actualDomainMismatch &&
    pwErrors.length === 0 &&
    passwordMatch
  )

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Administrator Account</h2>
      <p className="text-sm text-gray-500 mb-6">
        This account will have full admin access. Email must use <strong>@{state.domain}</strong>.
      </p>

      <div className="space-y-4">
        <div>
          <label className="label">Full name <span className="text-red-500">*</span></label>
          <input type="text" className="input" value={state.adminName} onChange={e => set("adminName", e.target.value)} />
        </div>
        <div>
          <label className="label">Email address <span className="text-red-500">*</span></label>
          <input
            type="email"
            className="input"
            placeholder={`admin@${state.domain}`}
            value={state.adminEmail}
            onChange={e => set("adminEmail", e.target.value)}
          />
          {actualDomainMismatch && (
            <p className="text-xs text-red-600 mt-1">Must use @{state.domain}</p>
          )}
        </div>
        <div>
          <label className="label">Password <span className="text-red-500">*</span></label>
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={state.adminPassword}
            onChange={e => set("adminPassword", e.target.value)}
          />
          {state.adminPassword && pwErrors.length > 0 && (
            <ul className="mt-1 text-xs text-red-600 space-y-0.5">
              {pwErrors.map(e => <li key={e}>• {e}</li>)}
            </ul>
          )}
        </div>
        <div>
          <label className="label">Confirm password <span className="text-red-500">*</span></label>
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={state.adminConfirmPassword}
            onChange={e => set("adminConfirmPassword", e.target.value)}
          />
          {state.adminConfirmPassword && !passwordMatch && (
            <p className="text-xs text-red-600 mt-1">Passwords do not match</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-6">
        <button onClick={onBack} className="btn-secondary btn">Back</button>
        <button onClick={onNext} disabled={!canContinue} className="btn-primary btn">Continue</button>
      </div>
    </div>
  )
}

// ─── Step 4: Licence ──────────────────────────────────────────────────────────

function Step4Licence({
  state, set, onNext, onBack,
}: { state: WizardState; set: <K extends keyof WizardState>(k: K, v: WizardState[K]) => void; onNext: () => void; onBack: () => void }) {
  const features: { key: keyof WizardState; label: string; description: string }[] = [
    { key: "featurePO",               label: "Purchase Orders",       description: "Track POs against projects" },
    { key: "featureResourcePlanning", label: "Resource Planning",     description: "Calendar-based team scheduling" },
    { key: "featureExpenses",         label: "Expense Management",    description: "Log and approve expense claims" },
    { key: "featureXero",             label: "Xero Integration",      description: "Sync invoices to Xero" },
    { key: "featureOnedrive",         label: "OneDrive Integration",  description: "Attach documents from OneDrive" },
  ]

  return (
    <div className="p-8">
      <h2 className="text-xl font-bold text-gray-900 mb-1">Licence Configuration</h2>
      <p className="text-sm text-gray-500 mb-6">Set user seat count and enable features for your organisation.</p>

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
              <label key={key} className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={!!state[key]}
                  onChange={e => set(key, e.target.checked as WizardState[typeof key])}
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
        <button onClick={onNext} className="btn-primary btn">Continue</button>
      </div>
    </div>
  )
}

// ─── Step 5: Complete ─────────────────────────────────────────────────────────

function Step5Complete({
  state, onBack,
}: { state: WizardState; onBack: () => void }) {
  const router   = useRouter()
  const [saving, setSaving]  = useState(false)
  const [error,  setError]   = useState("")

  async function launch() {
    setSaving(true)
    setError("")
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain:            state.domain,
          verificationToken: state.verificationToken,
          companyName:       state.companyName,
          companyLegalName:  state.companyLegalName || undefined,
          companyAddress:    state.companyAddress   || undefined,
          companyPhone:      state.companyPhone     || undefined,
          vatNumber:         state.vatNumber        || undefined,
          vatRegistered:     state.vatRegistered,
          companyRegNumber:  state.companyRegNumber || undefined,
          adminName:         state.adminName,
          adminEmail:        state.adminEmail.toLowerCase(),
          adminPassword:     state.adminPassword,
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
        setError(data.error ?? "Setup failed. Please try again.")
        setSaving(false)
        return
      }
      // Redirect to login with admin email pre-filled
      router.push(`/login?email=${encodeURIComponent(state.adminEmail.toLowerCase())}`)
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
      <h2 className="text-xl font-bold text-gray-900 mb-1">Ready to Launch</h2>
      <p className="text-sm text-gray-500 mb-6">Review your configuration and click Launch to complete setup.</p>

      <div className="space-y-4">
        {/* Summary cards */}
        <div className="rounded-lg bg-slate-50 border border-slate-200 divide-y divide-slate-200 text-sm">
          <SummaryRow label="Domain"       value={state.domain} mono />
          <SummaryRow label="Organisation" value={state.companyName} />
          <SummaryRow label="Admin email"  value={state.adminEmail} mono />
          <SummaryRow label="User seats"   value={String(state.licenceSeats)} />
          <SummaryRow label="Features"     value={enabledFeatures.length ? enabledFeatures.join(", ") : "None enabled"} />
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-6">
        <button onClick={onBack} disabled={saving} className="btn-secondary btn">Back</button>
        <button onClick={launch} disabled={saving} className="btn-primary btn px-6">
          {saving ? "Setting up…" : "Launch Tech Timesheet"}
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
