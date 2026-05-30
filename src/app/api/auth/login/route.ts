import { NextResponse } from "next/server";
import { createSessionCookieValue, passwordEnabled, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!process.env.APP_PASSWORD && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "APP_PASSWORD is required in production." }, { status: 500 });
  }

  if (!process.env.APP_PASSWORD && !passwordEnabled()) {
    return NextResponse.json({ ok: true });
  }

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || body.password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, createSessionCookieValue(), sessionCookieOptions());
  return response;
}
