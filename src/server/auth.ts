// Single shared access code from ACCESS_CODE in .env. The cookie holds a hash of the code, never the code itself.
// ponytail: one code for everyone, no users or expiry beyond the cookie; add real sessions if per-user access matters.
import { createHash, timingSafeEqual } from "node:crypto"

export const AUTH_COOKIE = "access_token"

const sha256 = (value: string) => createHash("sha256").update(value).digest()

// Hashing both sides first gives equal-length buffers, so timingSafeEqual never throws.
const safeEqual = (a: string, b: string) => timingSafeEqual(sha256(a), sha256(b))

export function sessionToken(code = process.env.ACCESS_CODE): string | null {
  return code ? sha256(`session:${code}`).toString("hex") : null
}

export function isValidCode(input: string, code = process.env.ACCESS_CODE): boolean {
  return Boolean(code) && safeEqual(input.trim(), code!)
}

export function isValidToken(token: string | undefined, code = process.env.ACCESS_CODE): boolean {
  const expected = sessionToken(code)
  return Boolean(expected && token) && safeEqual(token!, expected!)
}
