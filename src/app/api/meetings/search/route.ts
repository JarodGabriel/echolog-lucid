import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { fetchFathomMeetings, fetchFathomTranscript } from "@/lib/fathom";
import type { MeetingNote, MeetingSource } from "@/lib/types";

export const runtime = "nodejs";

const TRANSCRIPT_SEARCH_CHUNK_SIZE = 4;
const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you"
]);

export async function GET(request: Request) {
  if (!(await authenticated())) {
    return NextResponse.json({ error: "Sign in to Echolog Lucid." }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("query")?.trim() || "";
  const source = url.searchParams.get("source") as MeetingSource | "all" | null;

  if (query.length < 4) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      meetings: []
    });
  }

  // Granola content is already hydrated in the normal meeting list. This endpoint
  // exists for Fathom transcript search, which is too heavy for the initial load.
  if (source && source !== "all" && source !== "fathom") {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      meetings: []
    });
  }

  const fathom = await fetchFathomMeetings();
  const baseMatches = fathom.meetings.filter((meeting) => meetingMatchesQuery(meeting, query));
  const baseMatchIds = new Set(baseMatches.map((meeting) => meeting.id));
  const transcriptCandidates = fathom.meetings.filter((meeting) => meeting.recordingId && !baseMatchIds.has(meeting.id));
  const hydratedCandidates = await hydrateFathomTranscripts(transcriptCandidates);
  const transcriptMatches = hydratedCandidates.filter((meeting) => meetingMatchesQuery(meeting, query));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    meetings: [...baseMatches, ...transcriptMatches]
  });
}

async function hydrateFathomTranscripts(meetings: MeetingNote[]) {
  const hydrated: MeetingNote[] = [];

  for (const chunk of chunks(meetings, TRANSCRIPT_SEARCH_CHUNK_SIZE)) {
    hydrated.push(
      ...(await Promise.all(
        chunk.map(async (meeting) => {
          if (!meeting.recordingId) {
            return meeting;
          }

          try {
            const transcript = await fetchFathomTranscript(meeting.recordingId);
            return {
              ...meeting,
              transcript,
              transcriptPreview: transcriptToPreview(transcript)
            };
          } catch {
            return meeting;
          }
        })
      ))
    );
  }

  return hydrated;
}

function meetingMatchesQuery(meeting: MeetingNote, query: string) {
  const normalizedMeeting = normalizeSearchText(meetingSearchText(meeting));
  const normalizedQuery = normalizeSearchText(query);
  const collapsedMeeting = collapseSearchText(normalizedMeeting);
  const collapsedQuery = collapseSearchText(normalizedQuery);
  const queryTokens = searchTokens(normalizedQuery);

  return (
    normalizedMeeting.includes(normalizedQuery) ||
    collapsedMeeting.includes(collapsedQuery) ||
    (queryTokens.length > 0 &&
      queryTokens.every((token) => normalizedMeeting.includes(token) || collapsedMeeting.includes(collapseSearchText(token))))
  );
}

function meetingSearchText(meeting: MeetingNote) {
  return [
    meeting.title,
    meeting.summary,
    meeting.notes,
    meeting.contentStatus,
    meeting.transcript,
    meeting.attendees.join(" "),
    meeting.actionItems.join(" "),
    meeting.transcriptPreview.join(" ")
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseSearchText(value: string) {
  return value.replace(/\s/g, "");
}

function searchTokens(value: string) {
  return value.split(" ").filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
}

function transcriptToPreview(transcript: string) {
  return transcript.split("\n").filter(Boolean).slice(0, 10);
}

function chunks<T>(items: T[], size: number) {
  const grouped: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    grouped.push(items.slice(index, index + size));
  }

  return grouped;
}
