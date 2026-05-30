import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { fetchFathomMeetings } from "@/lib/fathom";
import { fetchGranolaMeetings } from "@/lib/granola-mcp";
import { GRANOLA_TOKEN_COOKIE, granolaCookieOptions, readGranolaTokens, refreshGranolaTokens, sealGranolaValue } from "@/lib/granola-oauth";
import type { MeetingsPayload } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  if (!(await authenticated())) {
    return NextResponse.json({ error: "Sign in to Echolog Lucid." }, { status: 401 });
  }

  let granolaTokens = await readGranolaTokens();
  let refreshedGranola = false;

  if (granolaTokens) {
    try {
      const refreshed = await refreshGranolaTokens(granolaTokens);
      refreshedGranola = refreshed.access_token !== granolaTokens.access_token || refreshed.refresh_token !== granolaTokens.refresh_token;
      granolaTokens = refreshed;
    } catch {
      granolaTokens = null;
    }
  }

  const [fathom, granola] = await Promise.all([
    fetchFathomMeetings(),
    fetchGranolaMeetings(granolaTokens)
  ]);

  const payload: MeetingsPayload = {
    generatedAt: new Date().toISOString(),
    meetings: [...granola.meetings, ...fathom.meetings].sort((left, right) => {
      return new Date(right.occurredAt || 0).getTime() - new Date(left.occurredAt || 0).getTime();
    }),
    connectors: {
      granola: granola.status,
      fathom: fathom.status
    }
  };

  const response = NextResponse.json(payload);
  if (granolaTokens && refreshedGranola) {
    response.cookies.set(GRANOLA_TOKEN_COOKIE, sealGranolaValue(granolaTokens), granolaCookieOptions());
  }

  if (!granolaTokens) {
    response.cookies.delete(GRANOLA_TOKEN_COOKIE);
  }

  return response;
}
