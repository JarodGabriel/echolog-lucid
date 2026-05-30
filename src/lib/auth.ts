import { cookies } from "next/headers";
import { randomToken, sign, verifySignature } from "@/lib/crypto";

export const SESSION_COOKIE = "mv_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function passwordEnabled() {
  return Boolean(process.env.APP_PASSWORD) || process.env.NODE_ENV === "production";
}

export async function authenticated() {
  if (!process.env.APP_PASSWORD && process.env.NODE_ENV !== "production") {
    return true;
  }

  if (!process.env.APP_PASSWORD) {
    return false;
  }

  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  return Boolean(session && verifySession(session));
}

export function createSessionCookieValue() {
  const issuedAt = Date.now().toString();
  const nonce = randomToken(18);
  const payload = `${issuedAt}.${nonce}`;
  return `${payload}.${sign(`session:${payload}`)}`;
}

export function verifySession(value: string) {
  const [issuedAt, nonce, signature] = value.split(".");
  if (!issuedAt || !nonce || !signature) {
    return false;
  }

  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > SESSION_MAX_AGE_SECONDS * 1000) {
    return false;
  }

  return verifySignature(`session:${issuedAt}.${nonce}`, signature);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS
  };
}
