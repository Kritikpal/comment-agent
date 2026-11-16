"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { AUTH_COOKIE, isValidCode, sessionToken } from "@/server/auth"

const THIRTY_DAYS = 60 * 60 * 24 * 30

export async function login(formData: FormData) {
  const code = String(formData.get("code") ?? "")
  if (!isValidCode(code)) redirect("/login?error=1")

  ;(await cookies()).set(AUTH_COOKIE, sessionToken()!, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS,
  })
  redirect("/")
}
