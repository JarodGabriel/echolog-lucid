import { NextRequest, NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { connectorEnabled } from "@/lib/connectors";
import { createGranolaAuthorization, GRANOLA_PENDING_COOKIE, granolaCookieOptions, sealGranolaValue } from "@/lib/granola-oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await authenticated())) {
    return NextResponse.redirect(new URL("/?login=1", request.url));
  }

  if (!connectorEnabled("granola")) {
    const url = new URL("/", request.url);
    url.searchParams.set("error", "Granola is disabled for this deployment.");
    return NextResponse.redirect(url);
  }

  try {
    const authorization = await createGranolaAuthorization(request);
    const response = NextResponse.redirect(authorization.url);
    response.cookies.set(GRANOLA_PENDING_COOKIE, sealGranolaValue(authorization.pending), granolaCookieOptions(60 * 10));
    return response;
  } catch (error) {
    const url = new URL("/", request.url);
    url.searchParams.set("error", error instanceof Error ? error.message : "Unable to start Granola OAuth.");
    return NextResponse.redirect(url);
  }
}
