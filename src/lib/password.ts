/**
 * Password hashing and verification using argon2id.
 *
 * argon2id is the recommended variant (OWASP, RFC 9106) — it provides
 * resistance against both side-channel and GPU-based attacks.
 *
 * Parameters below are deliberately conservative for a low-throughput
 * internal application (logins are not a hot path).
 */
import argon2 from "argon2"

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,       // 3 iterations
  parallelism: 4,
}

/**
 * Hash a plaintext password. Store the result — never the plaintext.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS)
}

/**
 * Verify a plaintext password against a stored argon2id hash.
 * Returns false (not throw) on mismatch so callers can handle it cleanly.
 */
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password)
  } catch {
    return false
  }
}
