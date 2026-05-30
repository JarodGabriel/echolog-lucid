import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { GRANOLA_TOKEN_COOKIE } from "@/lib/granola-oauth";

export const runtime = "nodejs";

export async function POST() {
  if (!(await authenticated())) {
    return NextResponse.json({ error: "Sign in to Echolog Lucid." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(GRANOLA_TOKEN_COOKIE);
  return response;
}
