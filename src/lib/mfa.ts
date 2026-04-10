/**
 * TOTP MFA utilities.
 *
 * - Secrets are stored AES-256-GCM encrypted in the database.
 * - Recovery codes are single-use argon2id-hashed 16-char hex tokens.
 * - QR codes are generated server-side and returned as data URIs.
 */
import { authenticator } from "otplib"
import qrcode from "qrcode"
import { randomBytes } from "crypto"
import { encrypt, decrypt } from "./crypto"
import { hashPassword, verifyPassword } from "./password"

// otplib defaults: SHA-1, 6 digits, 30-second window with ±1 step tolerance
authenticator.options = {
  window: 1, // allow one step before/after to account for clock skew
}

const RECOVERY_CODE_COUNT = 10
const RECOVERY_CODE_BYTES = 8 // 16 hex chars per code

// ---------------------------------------------------------------------------
// TOTP secret generation & verification
// ---------------------------------------------------------------------------

/**
 * Generate a new TOTP secret and return both the raw secret
 * and its AES-256-GCM encrypted form for storage.
 */
export function generateTotpSecret(): {
  secret: string
  encryptedSecret: string
} {
  const secret = authenticator.generateSecret()
  return { secret, encryptedSecret: encrypt(secret) }
}

/**
 * Decrypt a stored encrypted secret and verify a TOTP token against it.
 */
export function verifyTotp(encryptedSecret: string, token: string): boolean {
  try {
    const secret = decrypt(encryptedSecret)
    return authenticator.verify({ token, secret })
  } catch {
    return false
  }
}

/**
 * Build an otpauth URI and generate a QR code data URI for display.
 * The secret is never embedded in HTML — only the QR code image is returned.
 */
export async function generateQrCode(
  encryptedSecret: string,
  userEmail: string,
  appName = "Timesheet Pro"
): Promise<string> {
  const secret = decrypt(encryptedSecret)
  const otpauth = authenticator.keyuri(userEmail, appName, secret)
  return qrcode.toDataURL(otpauth)
}

// ---------------------------------------------------------------------------
// Recovery codes
// ---------------------------------------------------------------------------

/**
 * Generate RECOVERY_CODE_COUNT plaintext codes and return them alongside
 * their argon2id hashes for storage. The plaintext array is shown once to
 * the user and then discarded — only the hashes are stored.
 */
export async function generateRecoveryCodes(): Promise<{
  plaintext: string[]
  hashes: string[]
}> {
  const plaintext: string[] = []
  const hashes: string[] = []

  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const code = randomBytes(RECOVERY_CODE_BYTES).toString("hex").toUpperCase()
    const hash = await hashPassword(code)
    plaintext.push(formatRecoveryCode(code))
    hashes.push(hash)
  }

  return { plaintext, hashes }
}

/**
 * Format a raw hex code as XXXX-XXXX-XXXX-XXXX for readability.
 */
function formatRecoveryCode(raw: string): string {
  return raw.match(/.{4}/g)?.join("-") ?? raw
}

/**
 * Try each stored hash against the provided code (stripped of formatting).
 * Returns the index of the matched hash so the caller can remove it,
 * or -1 if no match.
 */
export async function findMatchingRecoveryCode(
  inputCode: string,
  storedHashes: string[]
): Promise<number> {
  const normalised = inputCode.replace(/-/g, "").toUpperCase()

  for (let i = 0; i < storedHashes.length; i++) {
    const match = await verifyPassword(normalised, storedHashes[i])
    if (match) return i
  }

  return -1
}
