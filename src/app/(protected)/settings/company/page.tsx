"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"

interface CompanySettings {
  companyName: string
  companyLegalName: string
  companyAddress: string
  companyEmail: string
  companyPhone: string
  companyWebsite: string
  vatNumber: string
  vatRegistered: boolean
  companyRegNumber: string
  bankName: string
  accountName: string
  sortCode: string
  accountNumber: string
  iban: string
  swiftBic: string
  defaultPaymentTerms: number
  invoicePrefix: string
  nextInvoiceNumber: number
  logoUrl: string
}

const EMPTY: CompanySettings = {
  companyName: "", companyLegalName: "", companyAddress: "",
  companyEmail: "", companyPhone: "", companyWebsite: "",
  vatNumber: "", vatRegistered: false, companyRegNumber: "",
  bankName: "", accountName: "", sortCode: "", accountNumber: "",
  iban: "", swiftBic: "",
  defaultPaymentTerms: 30, invoicePrefix: "INV", nextInvoiceNumber: 1,
  logoUrl: "",
}

export default function CompanySettingsPage() {
  const { data: session } = useSession()
  const [settings, setSettings] = useState<CompanySettings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null)

  const isAdmin = session?.user?.role === "ADMIN"

  useEffect(() => {
    fetch("/api/settings/company")
      .then((r) => r.json())
      .then((d) => {
        setSettings({
          companyName:         d.companyName         ?? "",
          companyLegalName:    d.companyLegalName     ?? "",
          companyAddress:      d.companyAddress       ?? "",
          companyEmail:        d.companyEmail         ?? "",
          companyPhone:        d.companyPhone         ?? "",
          companyWebsite:      d.companyWebsite       ?? "",
          vatNumber:           d.vatNumber            ?? "",
          vatRegistered:       d.vatRegistered        ?? false,
          companyRegNumber:    d.companyRegNumber     ?? "",
          bankName:            d.bankName             ?? "",
          accountName:         d.accountName          ?? "",
          sortCode:            d.sortCode             ?? "",
          accountNumber:       d.accountNumber        ?? "",
          iban:                d.iban                 ?? "",
          swiftBic:            d.swiftBic             ?? "",
          defaultPaymentTerms: d.defaultPaymentTerms  ?? 30,
          invoicePrefix:       d.invoicePrefix        ?? "INV",
          nextInvoiceNumber:   d.nextInvoiceNumber    ?? 1,
          logoUrl:             d.logoUrl              ?? "",
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function set<K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) {
    setSettings((prev) => ({ ...prev, [k]: v }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg(null)

    const payload: Partial<CompanySettings> = {
      ...settings,
      logoUrl: settings.logoUrl || undefined,
    }
    // remove empty strings → undefined so they don't overwrite with blanks
    ;(Object.keys(payload) as (keyof CompanySettings)[]).forEach((k) => {
      if (typeof payload[k] === "string" && payload[k] === "") {
        delete payload[k]
      }
    })

    const res = await fetch("/api/settings/company", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      setMsg({ ok: true, text: "Company settings saved." })
    } else {
      const d = await res.json()
      setMsg({ ok: false, text: d.error ?? "Failed to save." })
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>

  if (!isAdmin) return (
    <div className="p-6 max-w-2xl mx-auto">
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
        Only administrators can manage company settings.
      </p>
    </div>
  )

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Company Settings</h1>

      <form onSubmit={handleSave} className="space-y-6">

        {/* Company info */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Company Information</h2>
          <div className="form-grid">
            <div>
              <label className="label">Trading name</label>
              <input className="input" value={settings.companyName} onChange={(e) => set("companyName", e.target.value)} placeholder="e.g. Acme Ltd" />
            </div>
            <div>
              <label className="label">Legal name</label>
              <input className="input" value={settings.companyLegalName} onChange={(e) => set("companyLegalName", e.target.value)} placeholder="Full registered legal name" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Registered address</label>
              <textarea className="input" rows={3} value={settings.companyAddress} onChange={(e) => set("companyAddress", e.target.value)} placeholder="One line per row" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={settings.companyEmail} onChange={(e) => set("companyEmail", e.target.value)} placeholder="invoices@example.com" />
            </div>
            <div>
              <label className="label">Phone</label>
              <input type="tel" className="input" value={settings.companyPhone} onChange={(e) => set("companyPhone", e.target.value)} />
            </div>
            <div>
              <label className="label">Website</label>
              <input type="url" className="input" value={settings.companyWebsite} onChange={(e) => set("companyWebsite", e.target.value)} placeholder="https://example.com" />
            </div>
            <div>
              <label className="label">Company registration number</label>
              <input className="input" value={settings.companyRegNumber} onChange={(e) => set("companyRegNumber", e.target.value)} placeholder="e.g. 12345678" />
            </div>
          </div>
        </div>

        {/* VAT */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">VAT</h2>
          <div className="form-grid">
            <div className="sm:col-span-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.vatRegistered}
                  onChange={(e) => set("vatRegistered", e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm font-medium text-gray-700">VAT registered</span>
              </label>
              <p className="text-xs text-gray-400 mt-1 ml-7">When enabled, 20% VAT is added to invoice totals.</p>
            </div>
            {settings.vatRegistered && (
              <div>
                <label className="label">VAT number</label>
                <input className="input" value={settings.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} placeholder="GB123456789" />
              </div>
            )}
          </div>
        </div>

        {/* Invoice settings */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Invoice Settings</h2>
          <div className="form-grid">
            <div>
              <label className="label">Invoice number prefix</label>
              <input className="input" value={settings.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value)} placeholder="INV" maxLength={10} />
            </div>
            <div>
              <label className="label">Next invoice number</label>
              <input type="number" className="input" min="1" value={settings.nextInvoiceNumber} onChange={(e) => set("nextInvoiceNumber", parseInt(e.target.value) || 1)} />
            </div>
            <div>
              <label className="label">Default payment terms (days)</label>
              <input type="number" className="input" min="0" max="365" value={settings.defaultPaymentTerms} onChange={(e) => set("defaultPaymentTerms", parseInt(e.target.value) || 30)} />
            </div>
            <div>
              <label className="label">Logo URL</label>
              <input type="url" className="input" value={settings.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://cdn.example.com/logo.png" />
              <p className="text-xs text-gray-400 mt-1">Appears on invoice previews and print.</p>
            </div>
          </div>
        </div>

        {/* Bank details */}
        <div className="card p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Bank Details</h2>
          <p className="text-sm text-gray-500 mb-4">Displayed on invoice previews for client payment.</p>
          <div className="form-grid">
            <div>
              <label className="label">Bank name</label>
              <input className="input" value={settings.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="e.g. Barclays" />
            </div>
            <div>
              <label className="label">Account name</label>
              <input className="input" value={settings.accountName} onChange={(e) => set("accountName", e.target.value)} placeholder="e.g. Acme Ltd" />
            </div>
            <div>
              <label className="label">Sort code</label>
              <input className="input font-mono" value={settings.sortCode} onChange={(e) => set("sortCode", e.target.value)} placeholder="20-00-00" maxLength={10} />
            </div>
            <div>
              <label className="label">Account number</label>
              <input className="input font-mono" value={settings.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} placeholder="12345678" maxLength={20} />
            </div>
            <div>
              <label className="label">IBAN</label>
              <input className="input font-mono uppercase" value={settings.iban} onChange={(e) => set("iban", e.target.value.toUpperCase())} placeholder="GB29 NWBK 6016 1331 9268 19" maxLength={34} />
            </div>
            <div>
              <label className="label">SWIFT / BIC</label>
              <input className="input font-mono uppercase" value={settings.swiftBic} onChange={(e) => set("swiftBic", e.target.value.toUpperCase())} placeholder="BARCGB22" maxLength={11} />
            </div>
          </div>
        </div>

        {msg && (
          <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
        )}

        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save company settings"}
        </button>
      </form>
    </div>
  )
}
