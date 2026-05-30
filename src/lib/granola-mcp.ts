import type { ConnectorStatus, MeetingNote } from "@/lib/types";
import type { GranolaTokens } from "@/lib/granola-oauth";

const GRANOLA_MCP_URL = "https://mcp.granola.ai/mcp";
const GRANOLA_NOTES_URL = "https://notes.granola.ai";
const MCP_PROTOCOL_VERSION = "2025-06-18";
const GRANOLA_MEETING_ID_LIMIT = 10;
const MCP_REQUEST_TIMEOUT_MS = 24000;
const MCP_NOTIFICATION_TIMEOUT_MS = 5000;

type JsonRpcResponse = {
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

export function resolveGranolaSourceUrl(rawId?: string, explicitUrl?: string) {
  const explicitGranolaUrl = normalizeGranolaUrl(explicitUrl);
  if (explicitGranolaUrl) {
    return explicitGranolaUrl;
  }

  const id = rawId?.replace(/^granola-/, "");
  if (id && isUuid(id)) {
    return `${GRANOLA_NOTES_URL}/d/${encodeURIComponent(id)}`;
  }

  return undefined;
}

export async function fetchGranolaMeetings(tokens: GranolaTokens | null): Promise<{
  status: ConnectorStatus;
  meetings: MeetingNote[];
}> {
  const baseStatus: ConnectorStatus = {
    label: "Granola personal account",
    configured: true,
    connected: Boolean(tokens)
  };

  if (!tokens) {
    return {
      status: {
        ...baseStatus,
        connected: false,
        error: "Connect Granola with your personal email."
      },
      meetings: []
    };
  }

  try {
    const account = await callGranolaTool(tokens.access_token, "get_account_info", {});
    const accountText = extractText(account);
    const email = extractEmail(accountText);
    const recent = await getRecentGranolaPayload(tokens.access_token);
    const listedMeetings = normalizeGranolaMeetings(recent);
    const idHydratedMeetings = await hydrateGranolaMeetingContent(tokens.access_token, listedMeetings);
    const meetings = await hydrateGranolaMeetingContentFromQuery(tokens.access_token, idHydratedMeetings);

    return {
      status: {
        ...baseStatus,
        connected: true,
        email
      },
      meetings
    };
  } catch (error) {
    return {
      status: {
        ...baseStatus,
        connected: false,
        error: error instanceof Error ? error.message : "Unable to query Granola MCP."
      },
      meetings: []
    };
  }
}

export async function fetchGranolaMeetingDetail(
  tokens: GranolaTokens | null,
  meeting: Pick<MeetingNote, "id" | "title" | "occurredAt" | "attendees">
): Promise<MeetingNote> {
  const baseMeeting: MeetingNote = {
    id: meeting.id,
    source: "granola",
    title: meeting.title,
    occurredAt: meeting.occurredAt,
    attendees: meeting.attendees,
    actionItems: [],
    transcriptPreview: [],
    sourceUrl: resolveGranolaSourceUrl(meeting.id)
  };

  if (!tokens) {
    return {
      ...baseMeeting,
      contentStatus: "Reconnect Granola to load this meeting's note body."
    };
  }

  let detailed = baseMeeting;

  try {
    const result = await callGranolaTool(tokens.access_token, "query_granola_meetings", {
      query: `Return the notes and summary for the Granola meeting titled "${meeting.title}"${
        meeting.occurredAt ? ` on ${meeting.occurredAt}` : ""
      }. Include the main sections and action items.`
    });
    const candidates = normalizeGranolaMeetings(result).filter(hasGranolaContent);
    const match = findGranolaMatch(baseMeeting, candidates) || fallbackGranolaQueryContent(candidates);
    if (match) {
      detailed = mergeGranolaContent(detailed, match);
    }
  } catch (error) {
    detailed = {
      ...detailed,
      contentStatus: error instanceof Error ? error.message : "Granola did not return this note through query_granola_meetings."
    };
  }

  if (hasGranolaContent(detailed)) {
    return {
      ...detailed,
      contentStatus: undefined
    };
  }

  return addGranolaContentStatus(detailed);
}

async function hydrateGranolaMeetingContent(accessToken: string, meetings: MeetingNote[]) {
  const ids = meetings
    .map((meeting) => meeting.id.replace(/^granola-/, ""))
    .filter((id) => /^[a-f0-9-]{20,}$/i.test(id))
    .slice(0, 20);

  if (!ids.length) {
    return meetings.map((meeting) => ({
      ...meeting,
      contentStatus: "Granola returned this meeting's metadata, but not a note ID that Echolog Lucid can use to fetch the note body."
    }));
  }

  try {
    const hydrated: MeetingNote[] = [];
    for (const chunk of chunks(ids, GRANOLA_MEETING_ID_LIMIT)) {
      const detailed = await callGranolaTool(accessToken, "get_meetings", {
        meeting_ids: chunk
      });
      hydrated.push(...normalizeGranolaMeetings(detailed));
    }

    if (!hydrated.length) {
      return meetings.map((meeting) => ({
        ...meeting,
        contentStatus: "Granola returned meeting metadata, but no private or enhanced note content for this meeting."
      }));
    }

    return meetings.map((meeting) => {
      const match = hydrated.find((candidate) => {
        const candidateId = candidate.id.replace(/^granola-/, "");
        const meetingId = meeting.id.replace(/^granola-/, "");
        return candidateId === meetingId || (candidate.title === meeting.title && candidate.occurredAt === meeting.occurredAt);
      });

      return match && hasGranolaContent(match)
        ? { ...meeting, ...match }
        : {
            ...meeting,
            contentStatus: "Granola returned this meeting, but MCP did not return private notes, enhanced notes, or transcript content for it."
          };
    });
  } catch (error) {
    return meetings.map((meeting) => ({
      ...meeting,
      contentStatus: "Granola listed this meeting, but did not return note bodies through get_meetings."
    }));
  }
}

async function hydrateGranolaMeetingContentFromQuery(accessToken: string, meetings: MeetingNote[]) {
  const baseMeetings = meetings.slice(0, 25);
  if (!baseMeetings.length) {
    return [];
  }

  try {
    const query = [
      "Return notes and summaries for these exact Granola meetings.",
      "Use XML only. Do not include explanation before or after the XML.",
      "For each meeting, return:",
      '<meeting id="..." title="..." date="...">',
      "<summary><![CDATA[markdown summary]]></summary>",
      "<notes><![CDATA[private notes or enhanced notes]]></notes>",
      "<action_items><item>action item</item></action_items>",
      "</meeting>",
      "",
      "Meetings:",
      ...baseMeetings.map((meeting) => {
        const id = granolaRawId(meeting);
        return `- id: ${id}; title: ${meeting.title}; date: ${meeting.occurredAt || "recent"}; attendees: ${meeting.attendees.join(", ")}`;
      })
    ].join("\n");

    const result = await callGranolaTool(accessToken, "query_granola_meetings", { query });
    const hydrated = normalizeGranolaMeetings(result).filter(hasGranolaContent);

    if (!hydrated.length) {
      return baseMeetings.map(addGranolaContentStatus);
    }

    const plainResponse = hydrated.length === 1 ? fallbackGranolaQueryContent(hydrated) : undefined;
    const plainResponseText = plainResponse ? [plainResponse.summary, plainResponse.notes].filter(Boolean).join("\n\n") : "";
    if (plainResponseText) {
      return baseMeetings.map((meeting) => {
        if (hasGranolaContent(meeting)) {
          return meeting;
        }

        const extracted = extractPlainMeetingSummary(meeting, baseMeetings, plainResponseText);
        return extracted
          ? {
              ...meeting,
              summary: extracted,
              notes: extracted,
              actionItems: extractActionItems(extracted),
              contentStatus: undefined
            }
          : addGranolaContentStatus(meeting);
      });
    }

    return baseMeetings.map((meeting) => {
      if (hasGranolaContent(meeting)) {
        return meeting;
      }

      const match = findGranolaMatch(meeting, hydrated);
      return match ? mergeGranolaContent(meeting, match) : addGranolaContentStatus(meeting);
    });
  } catch {
    return baseMeetings.map(addGranolaContentStatus);
  }
}

function hasGranolaContent(meeting: MeetingNote) {
  return Boolean(meeting.summary || meeting.notes || meeting.actionItems.length || meeting.transcript || meeting.transcriptPreview.length);
}

function findGranolaMatch(meeting: MeetingNote, candidates: MeetingNote[]) {
  const meetingId = granolaRawId(meeting);
  const meetingTitle = normalizeMatchText(meeting.title);

  return candidates.find((candidate) => {
    const candidateId = granolaRawId(candidate);
    if (candidateId && meetingId && candidateId === meetingId) {
      return true;
    }

    const candidateTitle = normalizeMatchText(candidate.title);
    const titleMatches = candidateTitle === meetingTitle || candidateTitle.includes(meetingTitle) || meetingTitle.includes(candidateTitle);
    return titleMatches && sameCalendarDay(candidate.occurredAt, meeting.occurredAt);
  });
}

function fallbackGranolaQueryContent(candidates: MeetingNote[]) {
  if (!candidates.length) {
    return undefined;
  }

  const plainAnswer = candidates.find((candidate) => candidate.id === "granola-recent-notes" || candidate.title === "Recent Granola notes");
  if (plainAnswer) {
    return plainAnswer;
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

function extractPlainMeetingSummary(meeting: MeetingNote, allMeetings: MeetingNote[], text: string) {
  const lowerText = text.toLowerCase();
  const title = meeting.title.trim();
  if (!title) {
    return undefined;
  }

  const start = lowerText.indexOf(title.toLowerCase());
  if (start < 0) {
    return undefined;
  }

  const nextStarts = allMeetings
    .filter((candidate) => candidate.id !== meeting.id)
    .map((candidate) => {
      const index = lowerText.indexOf(candidate.title.trim().toLowerCase(), start + title.length);
      return index > start ? index : undefined;
    })
    .filter((index): index is number => typeof index === "number")
    .sort((left, right) => left - right);
  const end = nextStarts[0] || text.length;
  const extracted = text.slice(start, end).replace(/^[-#*\s]*/, "").trim();

  return extracted.length > title.length + 20 ? extracted : undefined;
}

function mergeGranolaContent(current: MeetingNote, incoming: MeetingNote): MeetingNote {
  const merged: MeetingNote = {
    ...current,
    title: current.title || incoming.title,
    occurredAt: current.occurredAt || incoming.occurredAt,
    attendees: current.attendees.length ? current.attendees : incoming.attendees,
    summary: incoming.summary || current.summary,
    notes: incoming.notes || current.notes,
    actionItems: incoming.actionItems.length ? incoming.actionItems : current.actionItems,
    transcript: incoming.transcript || current.transcript,
    transcriptPreview: incoming.transcriptPreview.length ? incoming.transcriptPreview : current.transcriptPreview,
    sourceUrl: preferredGranolaSourceUrl(incoming.sourceUrl, current.sourceUrl)
  };

  return hasGranolaContent(merged)
    ? {
        ...merged,
        contentStatus: undefined
      }
    : {
        ...merged,
        contentStatus: current.contentStatus || incoming.contentStatus
      };
}

function granolaRawId(meeting: MeetingNote) {
  return meeting.id.replace(/^granola-/, "");
}

function normalizeMatchText(value?: string) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameCalendarDay(left?: string, right?: string) {
  if (!left || !right) {
    return true;
  }

  const leftDate = new Date(left);
  const rightDate = new Date(right);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) {
    return left === right;
  }

  return leftDate.toISOString().slice(0, 10) === rightDate.toISOString().slice(0, 10);
}

function addGranolaContentStatus(meeting: MeetingNote): MeetingNote {
  if (hasGranolaContent(meeting) || meeting.contentStatus) {
    return meeting;
  }

  return {
    ...meeting,
    contentStatus:
      "Granola MCP returned metadata only for this meeting. Echolog Lucid tried to fetch notes and transcript content, but Granola did not return either for this meeting."
  };
}

async function hydrateGranolaTranscripts(accessToken: string, meetings: MeetingNote[]) {
  const hydrated: MeetingNote[] = [];
  const transcriptLimit = 10;
  let transcriptAttempts = 0;

  for (const meeting of meetings) {
    const meetingId = meeting.id.replace(/^granola-/, "");
    if (!/^[a-f0-9-]{20,}$/i.test(meetingId) || transcriptAttempts >= transcriptLimit) {
      hydrated.push(meeting);
      continue;
    }

    transcriptAttempts += 1;
    try {
      const transcript = await fetchGranolaTranscript(accessToken, meetingId);
      if (transcript) {
        hydrated.push({
          ...meeting,
          transcript,
          transcriptPreview: transcriptToPreview(transcript)
        });
      } else {
        hydrated.push(meeting);
      }
    } catch (error) {
      hydrated.push({
        ...meeting,
        contentStatus: [meeting.contentStatus, "Granola MCP did not return a transcript for this meeting."].filter(Boolean).join("\n")
      });
    }
  }

  return hydrated;
}

async function fetchGranolaTranscript(accessToken: string, meetingId: string) {
  const result = await callGranolaTool(accessToken, "get_meeting_transcript", {
    meeting_id: meetingId
  });
  return extractTranscriptText(result);
}

async function getRecentGranolaPayload(accessToken: string) {
  const attempts: Array<[string, Record<string, unknown>]> = [
    ["list_meetings", { time_range: "last_30_days" }],
    [
      "query_granola_meetings",
      {
        query:
          "Show my recent meetings from the last 30 days. Include meeting IDs, titles, dates, attendees, private notes, enhanced notes, summaries, decisions, and action items when available."
      }
    ]
  ];

  let lastError: Error | null = null;
  for (const [name, args] of attempts) {
    try {
      return await callGranolaTool(accessToken, name, args);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Granola MCP tool call failed.");
    }
  }

  throw lastError || new Error("No Granola MCP meeting tool returned data.");
}

async function callGranolaTool(accessToken: string, name: string, args: Record<string, unknown>) {
  const sessionId = await initializeSession(accessToken);
  const response = await mcpPost(accessToken, {
    jsonrpc: "2.0",
    id: randomId(),
    method: "tools/call",
    params: {
      name,
      arguments: args
    }
  }, sessionId);

  if (response.error) {
    throw new Error(response.error.message || `${name} failed`);
  }

  const toolError = extractToolError(response.result);
  if (toolError) {
    throw new Error(toolError);
  }

  return response.result;
}

async function initializeSession(accessToken: string) {
  const initialized = await mcpPost(accessToken, {
    jsonrpc: "2.0",
    id: randomId(),
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: "echolog-lucid-pwa",
        version: "0.1.0"
      }
    }
  });

  const sessionId = initialized.sessionId;
  if (!sessionId) {
    return undefined;
  }

  try {
    await mcpPost(accessToken, {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    }, sessionId, MCP_NOTIFICATION_TIMEOUT_MS);
  } catch {
    // Some MCP hosts acknowledge notifications without a normal response body.
  }

  return sessionId;
}

async function mcpPost(accessToken: string, body: Record<string, unknown>, sessionId?: string, timeoutMs = MCP_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(GRANOLA_MCP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
        ...(sessionId ? { "MCP-Session-Id": sessionId } : {})
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(response.status === 401 ? "Reconnect Granola; the MCP token is no longer valid." : `Granola MCP returned ${response.status}.`);
    }

    const parsed = parseMcpResponse(await readMcpResponseText(response), response.headers.get("content-type"));
    return {
      ...parsed,
      sessionId: response.headers.get("mcp-session-id") || undefined
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Granola took too long to return this note. Try opening it again in a moment.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readMcpResponseText(response: Response) {
  const contentType = response.headers.get("content-type");
  if (!contentType?.includes("text/event-stream") || !response.body) {
    return response.text();
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const payload = firstMcpDataPayload(buffer);
      if (payload) {
        await reader.cancel().catch(() => undefined);
        return payload;
      }
    }

    buffer += decoder.decode();
    return firstMcpDataPayload(buffer) || "";
  } finally {
    reader.releaseLock();
  }
}

function parseMcpResponse(text: string, contentType: string | null): JsonRpcResponse {
  if (contentType?.includes("text/event-stream")) {
    const trimmed = text.trim();
    const jsonLine = isJsonObjectText(trimmed) ? trimmed : firstMcpDataPayload(text);
    return jsonLine ? JSON.parse(jsonLine) : {};
  }

  return text ? JSON.parse(text) : {};
}

function firstMcpDataPayload(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s*/, ""))
    .find((line) => line && line !== "[DONE]" && isJsonObjectText(line));
}

function isJsonObjectText(value: string) {
  return value.startsWith("{") && value.endsWith("}");
}

function normalizeGranolaMeetings(result: unknown): MeetingNote[] {
  const structured = findMeetingObjects(result);
  if (structured.length) {
    return structured.slice(0, 25).map((item, index) => normalizeGranolaObject(item, index));
  }

  const text = extractText(result).trim();
  if (isMcpErrorText(text)) {
    return [];
  }

  const xmlishMeetings = parseGranolaXmlishMeetings(text);
  if (xmlishMeetings.length) {
    return xmlishMeetings.slice(0, 25);
  }

  if (!text) {
    return [];
  }

  return [
    {
      id: "granola-recent-notes",
      source: "granola",
      title: "Recent Granola notes",
      occurredAt: new Date().toISOString(),
      attendees: [],
      summary: text,
      actionItems: extractActionItems(text),
      transcriptPreview: []
    }
  ];
}

function extractToolError(result: unknown) {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const objectResult = result as Record<string, unknown>;
  const text = extractText(result).trim();
  if (objectResult.isError === true) {
    return text || "Granola MCP tool call failed.";
  }

  if (isMcpErrorText(text)) {
    return text;
  }

  return undefined;
}

function isMcpErrorText(text: string) {
  return /^MCP error\b/i.test(text) || /Input validation error/i.test(text);
}

function normalizeGranolaObject(item: Record<string, unknown>, index: number): MeetingNote {
  const title = stringFrom(item.title) || stringFrom(item.meeting_title) || stringFrom(item.name) || "Granola meeting";
  const occurredAt = stringFrom(item.date) || stringFrom(item.meeting_date) || stringFrom(item.created_at) || stringFrom(item.start_time);
  const notes =
    firstStringFromObject(item, [
      "enhanced_notes",
      "enhancedNotes",
      "meeting_notes",
      "meetingNotes",
      "generated_notes",
      "ai_notes",
      "notes",
      "private_notes",
      "privateNotes",
      "personal_notes",
      "markdown",
      "body"
    ]) || undefined;
  const summary = firstStringFromObject(item, ["summary", "meeting_summary", "overview", "abstract"]) || notes;
  const transcript = cleanTranscriptText(
    firstStringFromObject(item, ["transcript", "raw_transcript", "rawTranscript", "meeting_transcript", "meetingTranscript"])
  );
  const id = stringFrom(item.id) || stringFrom(item.meeting_id) || `granola-${index}-${title}`;
  const attendees = arrayOfStrings(item.attendees || item.participants || item.invitees);
  const explicitSourceUrl = directStringFromObject(item, [
    "web_url",
    "webUrl",
    "note_url",
    "noteUrl",
    "source_url",
    "sourceUrl",
    "share_url",
    "shareUrl",
    "url"
  ]);

  return {
    id: `granola-${id}`,
    source: "granola",
    title,
    occurredAt,
    attendees,
    summary,
    notes,
    actionItems: arrayOfStrings(item.action_items || item.actions || item.todos || item.next_steps).concat(extractActionItems(summary || "")),
    transcript,
    transcriptPreview: transcript ? transcriptToPreview(transcript) : [],
    sourceUrl: resolveGranolaSourceUrl(id, explicitSourceUrl)
  };
}

function parseGranolaXmlishMeetings(text: string): MeetingNote[] {
  if (!text.includes("<meeting")) {
    return [];
  }

  const meetings: MeetingNote[] = [];
  const meetingPattern = /<meeting\b([^>]*)>([\s\S]*?)<\/meeting>/gi;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = meetingPattern.exec(text)) !== null) {
    const attrs = parseAttributes(match[1] || "");
    const body = match[2] || "";
    const id = attrs.id || attrs.meeting_id || `granola-${index}`;
    const title = attrs.title || attrs.name || "Granola meeting";
    const occurredAt = attrs.date || attrs.meeting_date || attrs.created_at || attrs.start_time;
    const explicitSourceUrl =
      attrs.web_url ||
      attrs["web-url"] ||
      attrs.note_url ||
      attrs["note-url"] ||
      attrs.source_url ||
      attrs["source-url"] ||
      attrs.share_url ||
      attrs["share-url"] ||
      attrs.url ||
      attrs.href;
    const participants = extractXmlishSection(body, "known_participants") || extractXmlishSection(body, "participants");
    const privateNotes = extractFirstXmlishSection(body, ["private_notes", "private-notes", "personal_notes", "user_notes"]);
    const enhancedNotes = extractFirstXmlishSection(body, [
      "enhanced_notes",
      "enhanced-notes",
      "meeting_notes",
      "generated_notes",
      "ai_notes",
      "notes",
      "markdown",
      "body"
    ]);
    const summary = extractFirstXmlishSection(body, ["summary", "meeting_summary", "overview", "abstract"]) || enhancedNotes || privateNotes;
    const decisions = extractFirstXmlishSection(body, ["decisions", "decision_log"]);
    const transcript = cleanTranscriptText(extractFirstXmlishSection(body, ["transcript", "raw_transcript", "meeting_transcript"]));
    const actionItems = [
      ...parseActionItemSection(extractFirstXmlishSection(body, ["action_items", "action-items"])),
      ...parseActionItemSection(extractFirstXmlishSection(body, ["actions", "next_steps", "follow_ups", "todos"])),
      ...extractActionItems([summary, enhancedNotes, privateNotes, decisions].filter(Boolean).join("\n"))
    ];

    meetings.push({
      id: `granola-${id}`,
      source: "granola",
      title: cleanXmlishText(title) || "Granola meeting",
      occurredAt,
      attendees: parseParticipants(participants),
      summary: cleanXmlishText(summary),
      notes: cleanXmlishText([privateNotes, enhancedNotes, decisions].filter(Boolean).join("\n\n")),
      actionItems,
      transcript,
      transcriptPreview: transcript ? transcriptToPreview(transcript) : [],
      sourceUrl: resolveGranolaSourceUrl(id, explicitSourceUrl)
    });
    index += 1;
  }

  return meetings;
}

function parseAttributes(raw: string) {
  const attrs: Record<string, string> = {};
  const attrPattern = /([\w:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(raw)) !== null) {
    attrs[match[1]] = match[2];
  }

  return attrs;
}

function extractXmlishSection(body: string, tagName: string) {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = body.match(pattern);
  return match?.[1] ? cleanXmlishText(match[1]) : undefined;
}

function extractFirstXmlishSection(body: string, tagNames: string[]) {
  for (const tagName of tagNames) {
    const value = extractXmlishSection(body, tagName);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function parseParticipants(value?: string) {
  if (!value) {
    return [];
  }

  return value
    .split(/,(?![^<]*>)/)
    .map((participant) => cleanXmlishText(participant))
    .filter(isString);
}

function parseActionItemSection(value?: string) {
  if (!value) {
    return [];
  }

  const itemMatches = Array.from(value.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi))
    .map((match) => cleanXmlishText(match[1]))
    .filter(isString);
  if (itemMatches.length) {
    return itemMatches;
  }

  return value
    .split(/\n|(?:^|\s*)[-*]\s+/)
    .map((item) => cleanXmlishText(item))
    .filter(isString);
}

function cleanXmlishText(value?: string) {
  if (!value) {
    return undefined;
  }

  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/^<p>|<\/p>$/gi, "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function preferredGranolaSourceUrl(primary?: string, fallback?: string) {
  const normalizedPrimary = normalizeGranolaUrl(primary);
  const normalizedFallback = normalizeGranolaUrl(fallback);

  if (normalizedPrimary) {
    return normalizedPrimary;
  }

  return normalizedFallback;
}

function normalizeGranolaUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname.endsWith("granola.ai") && url.hostname !== "app.granola.ai") {
      return url.toString();
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function findMeetingObjects(value: unknown): Array<Record<string, unknown>> {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    const parsed = tryParseJson(value);
    return parsed ? findMeetingObjects(parsed) : [];
  }

  if (Array.isArray(value)) {
    const records = value.filter(isMeetingLike);
    if (records.length) {
      return records;
    }

    return value.flatMap(findMeetingObjects);
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (isMeetingLike(objectValue)) {
      return [objectValue];
    }

    return Object.values(objectValue).flatMap(findMeetingObjects);
  }

  return [];
}

function isMeetingLike(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const objectValue = value as Record<string, unknown>;
  return Boolean(
    objectValue.title ||
      objectValue.meeting_title ||
      objectValue.meeting_id ||
      objectValue.enhanced_notes ||
      objectValue.private_notes
  );
}

function extractText(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(extractText).filter(Boolean).join("\n\n");
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    if (typeof objectValue.text === "string") {
      return objectValue.text;
    }

    if (typeof objectValue.content === "string") {
      return objectValue.content;
    }

    if (Array.isArray(objectValue.content)) {
      return extractText(objectValue.content);
    }

    return Object.values(objectValue).map(extractText).filter(Boolean).join("\n\n");
  }

  return "";
}

function extractTranscriptText(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return cleanTranscriptText(value);
  }

  if (Array.isArray(value)) {
    const lines = value.map(transcriptLineFromValue).filter(isString);
    if (lines.length) {
      return cleanTranscriptText(lines.join("\n"));
    }

    return cleanTranscriptText(value.map(extractTranscriptText).filter(isString).join("\n"));
  }

  if (typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const direct =
      directStringFromObject(objectValue, [
        "transcript",
        "raw_transcript",
        "rawTranscript",
        "meeting_transcript",
        "meetingTranscript",
        "text",
        "content"
      ]) || undefined;

    if (direct) {
      return cleanTranscriptText(direct);
    }

    const nestedLines = Object.values(objectValue).map(extractTranscriptText).filter(isString);
    return cleanTranscriptText(nestedLines.join("\n"));
  }

  return undefined;
}

function transcriptLineFromValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const objectValue = value as Record<string, unknown>;
  const speaker =
    stringFrom(objectValue.speaker) ||
    stringFrom(objectValue.speaker_name) ||
    stringFrom(objectValue.speakerName) ||
    firstStringFromObject(objectValue.speaker, ["display_name", "name"]);
  const text = stringFrom(objectValue.text) || stringFrom(objectValue.content) || stringFrom(objectValue.transcript);

  if (!text) {
    return undefined;
  }

  return [speaker ? `${speaker}:` : "", text].filter(Boolean).join(" ");
}

function cleanTranscriptText(value?: string) {
  const cleaned = cleanXmlishText(value)
    ?.replace(/<transcript\b[^>]*>/gi, "")
    .replace(/<\/transcript>/gi, "")
    .replace(/<entry\b[^>]*>/gi, "")
    .replace(/<\/entry>/gi, "\n")
    .replace(/<speaker\b[^>]*>/gi, "")
    .replace(/<\/speaker>/gi, ": ")
    .replace(/<text\b[^>]*>/gi, "")
    .replace(/<\/text>/gi, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned || isMcpErrorText(cleaned)) {
    return undefined;
  }

  return cleaned;
}

function transcriptToPreview(transcript: string) {
  return transcript
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function chunks<T>(values: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    groups.push(values.slice(index, index + size));
  }

  return groups;
}

function extractEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
}

function extractActionItems(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*]\s*)?(?:action|todo|follow up|next step)/i.test(line))
    .slice(0, 8);
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object") {
        const objectItem = item as Record<string, unknown>;
        return stringFrom(objectItem.name) || stringFrom(objectItem.email) || stringFrom(objectItem.description) || stringFrom(objectItem.text);
      }

      return undefined;
    })
    .filter(Boolean) as string[];
}

function stringFrom(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstStringFromObject(value: unknown, keys: string[]): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const objectValue = value as Record<string, unknown>;
  for (const key of keys) {
    const direct = stringFrom(objectValue[key]);
    if (direct) {
      return direct;
    }
  }

  for (const nested of Object.values(objectValue)) {
    if (nested && typeof nested === "object") {
      const found = firstStringFromObject(nested, keys);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

function directStringFromObject(value: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const direct = stringFrom(value[key]);
    if (direct) {
      return direct;
    }
  }

  return undefined;
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function randomId() {
  return Math.floor(Math.random() * 1_000_000);
}
