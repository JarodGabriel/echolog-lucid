import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { fetchGranolaMeetingDetail } from "@/lib/granola-mcp";
import { GRANOLA_TOKEN_COOKIE, granolaCookieOptions, readGranolaTokens, refreshGranolaTokens, sealGranolaValue } from "@/lib/granola-oauth";
import type { MeetingNote } from "@/lib/types";

export const runtime = "nodejs";
const GRANOLA_DETAIL_ROUTE_TIMEOUT_MS = 22000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ meetingId: string }> }
) {
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

  const { meetingId } = await params;
  const url = new URL(request.url);
  const title = url.searchParams.get("title") || "Granola meeting";
  const occurredAt = url.searchParams.get("occurredAt") || undefined;
  const attendees = parseAttendees(url.searchParams.get("attendees"));
  const id = `granola-${meetingId.replace(/^granola-/, "")}`;

  const baseMeeting = { id, title, occurredAt, attendees };
  const meeting = await withTimeout(
    fetchGranolaMeetingDetail(granolaTokens, baseMeeting).catch((error) => granolaErrorMeeting(baseMeeting, error)),
    GRANOLA_DETAIL_ROUTE_TIMEOUT_MS,
    granolaTimeoutMeeting(baseMeeting)
  );

  const response = NextResponse.json({ meeting });
  if (granolaTokens && refreshedGranola) {
    response.cookies.set(GRANOLA_TOKEN_COOKIE, sealGranolaValue(granolaTokens), granolaCookieOptions());
  }

  if (!granolaTokens) {
    response.cookies.delete(GRANOLA_TOKEN_COOKIE);
  }

  return response;
}

function granolaTimeoutMeeting(meeting: Pick<MeetingNote, "id" | "title" | "occurredAt" | "attendees">): MeetingNote {
  return {
    ...meeting,
    source: "granola",
    actionItems: [],
    transcriptPreview: [],
    sourceUrl: "https://app.granola.ai",
    contentStatus: "Granola is taking too long to return this note. Tap Retry Granola, or open the source note."
  };
}

function granolaErrorMeeting(meeting: Pick<MeetingNote, "id" | "title" | "occurredAt" | "attendees">, error: unknown): MeetingNote {
  return {
    ...meeting,
    source: "granola",
    actionItems: [],
    transcriptPreview: [],
    sourceUrl: "https://app.granola.ai",
    contentStatus: error instanceof Error ? error.message : "Granola did not return this note."
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    })
  ]);
}

function parseAttendees(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
