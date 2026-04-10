/**
 * AES-256-GCM encryption for secrets stored at rest.
 *
 * Used for:
 *   - TOTP secrets (mfaSecretEnc on User)
 *   - Xero OAuth tokens (xeroAccessTokenEnc, xeroRefreshTokenEnc on Invoice)
 *
 * Format of ciphertext: base64(`iv:authTag:encryptedData`) where each
 * component is hex-encoded and separated by colons before base64 encoding.
 */
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto"
import { env } from "./env"

const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12   // 96-bit IV recommended for GCM
const TAG_BYTES = 16  // 128-bit auth tag (GCM default)
const SEPARATOR = ":"

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, "hex")
}

/**
 * Encrypt a plaintext string. Returns a compact base64 string.
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])

  const tag = cipher.getAuthTag()

  const payload = [
    iv.toString("hex"),
    tag.toString("hex"),
    encrypted.toString("hex"),
  ].join(SEPARATOR)

  return Buffer.from(payload).toString("base64")
}

/**
 * Decrypt a value produced by `encrypt`. Throws on tampered ciphertext.
 */
export function decrypt(ciphertext: string): string {
  const key = getKey()
  const payload = Buffer.from(ciphertext, "base64").toString("utf8")
  const parts = payload.split(SEPARATOR)

  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format")
  }

  const [ivHex, tagHex, encHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const encrypted = Buffer.from(encHex, "hex")

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])

  return decrypted.toString("utf8")
}

/**
 * Constant-time comparison of two strings (prevents timing attacks).
 */
export function safeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still run the comparison so timing is consistent
    timingSafeEqual(Buffer.from(a), Buffer.from(a))
    return false
  }
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
