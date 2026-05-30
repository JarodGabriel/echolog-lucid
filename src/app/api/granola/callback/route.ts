import { NextRequest, NextResponse } from "next/server";
import { exchangeGranolaCode, GRANOLA_PENDING_COOKIE, GRANOLA_TOKEN_COOKIE, granolaCookieOptions, readPendingGranolaOAuth, sealGranolaValue } from "@/lib/granola-oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const pending = readPendingGranolaOAuth(request.cookies.get(GRANOLA_PENDING_COOKIE)?.value);
  const redirect = new URL("/", request.url);

  if (!code || !state || !pending || pending.state !== state) {
    redirect.searchParams.set("error", "Granola sign-in could not be verified. Try connecting again.");
    return NextResponse.redirect(redirect);
  }

  if (Date.now() - pending.createdAt > 1000 * 60 * 10) {
    redirect.searchParams.set("error", "Granola sign-in expired. Try connecting again.");
    return NextResponse.redirect(redirect);
  }

  try {
    const tokens = await exchangeGranolaCode(code, pending);
    redirect.searchParams.set("connected", "granola");
    const response = NextResponse.redirect(redirect);
    response.cookies.set(GRANOLA_TOKEN_COOKIE, sealGranolaValue(tokens), granolaCookieOptions());
    response.cookies.delete(GRANOLA_PENDING_COOKIE);
    return response;
  } catch (error) {
    redirect.searchParams.set("error", error instanceof Error ? error.message : "Unable to finish Granola sign-in.");
    return NextResponse.redirect(redirect);
  }
}
