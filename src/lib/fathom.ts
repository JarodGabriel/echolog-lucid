import type { ConnectorStatus, MeetingNote } from "@/lib/types";
import { connectorEnabled, connectorLabel, disabledConnectorStatus } from "@/lib/connectors";

const FATHOM_API_URL = "https://api.fathom.ai/external/v1/meetings";
const FATHOM_RECORDINGS_API_URL = "https://api.fathom.ai/external/v1/recordings";
const DEFAULT_LOOKBACK_DAYS = 14;

type FathomInvitee = {
  name?: string;
  email?: string;
};

type FathomTranscriptLine = {
  speaker?: {
    display_name?: string;
  };
  text?: string;
  timestamp?: string;
};

type FathomActionItem = {
  description?: string;
  recording_playback_url?: string;
  assignee?: {
    name?: string;
    email?: string;
  };
};

type FathomMeeting = {
  title?: string;
  meeting_title?: string;
  recording_id?: string | number;
  url?: string;
  share_url?: string;
  created_at?: string;
  scheduled_start_time?: string;
  recording_start_time?: string;
  calendar_invitees?: FathomInvitee[];
  recorded_by?: {
    name?: string;
    email?: string;
    team?: string;
  };
  transcript?: FathomTranscriptLine[];
  default_summary?: {
    markdown_formatted?: string;
  };
  action_items?: FathomActionItem[];
};

type FathomResponse = {
  items?: FathomMeeting[];
  next_cursor?: string | null;
};

type FathomTranscriptResponse = {
  transcript?: FathomTranscriptLine[];
};

export async function fetchFathomMeetings({
  includeTranscript = false
}: {
  includeTranscript?: boolean;
} = {}): Promise<{
  status: ConnectorStatus;
  meetings: MeetingNote[];
}> {
  if (!connectorEnabled("fathom")) {
    return {
      status: disabledConnectorStatus("fathom"),
      meetings: []
    };
  }

  const apiKey = normalizeFathomApiKey(process.env.FATHOM_API_KEY);
  const status: ConnectorStatus = {
    enabled: true,
    label: connectorLabel("fathom"),
    configured: Boolean(apiKey),
    connected: false
  };

  if (!apiKey) {
    return {
      status: {
        ...status,
        error: "Add FATHOM_API_KEY from your work Fathom account."
      },
      meetings: []
    };
  }

  const items: FathomMeeting[] = [];
  let cursor: string | null | undefined;
  const createdAfter = new Date(Date.now() - 1000 * 60 * 60 * 24 * getLookbackDays()).toISOString();

  for (let page = 0; page < 3; page += 1) {
    const url = new URL(FATHOM_API_URL);
    url.searchParams.set("include_summary", "true");
    url.searchParams.set("include_action_items", "true");
    url.searchParams.set("include_transcript", includeTranscript ? "true" : "false");
    url.searchParams.set("created_after", createdAfter);
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url, {
      headers: {
        "X-Api-Key": apiKey
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        status: {
          ...status,
          error: `Fathom returned ${response.status}. Check the API key and account access.`
        },
        meetings: []
      };
    }

    const data = (await response.json()) as FathomResponse;
    items.push(...(data.items || []));
    cursor = data.next_cursor;
    if (!cursor) {
      break;
    }
  }

  const meetings = items.map(normalizeFathomMeeting);

  return {
    status: {
      ...status,
      connected: true,
      email: meetings.find((meeting) => meeting.ownerEmail)?.ownerEmail
    },
    meetings
  };
}

export async function fetchFathomTranscript(recordingId: string): Promise<string> {
  if (!connectorEnabled("fathom")) {
    throw new Error("Fathom is disabled for this deployment.");
  }

  const apiKey = normalizeFathomApiKey(process.env.FATHOM_API_KEY);
  if (!apiKey) {
    throw new Error("Add FATHOM_API_KEY from your work Fathom account.");
  }

  const response = await fetch(`${FATHOM_RECORDINGS_API_URL}/${encodeURIComponent(recordingId)}/transcript`, {
    headers: {
      "X-Api-Key": apiKey
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Fathom returned ${response.status} while fetching this transcript.`);
  }

  const data = (await response.json()) as FathomTranscriptResponse;
  return transcriptLinesToText(data.transcript || []);
}

function normalizeFathomMeeting(meeting: FathomMeeting): MeetingNote {
  const title = meeting.meeting_title || meeting.title || "Untitled Fathom meeting";
  const recordingId = meeting.recording_id ? String(meeting.recording_id) : undefined;
  const id = `fathom-${recordingId || meeting.url || title}`;
  const attendees = (meeting.calendar_invitees || [])
    .map((invitee) => invitee.name || invitee.email)
    .filter(Boolean) as string[];
  const actionItems = (meeting.action_items || [])
    .map((item) => {
      const assignee = item.assignee?.name || item.assignee?.email;
      return [item.description, assignee ? `(${assignee})` : ""].filter(Boolean).join(" ");
    })
    .filter(Boolean);
  const transcript = transcriptLinesToText(meeting.transcript || []);
  const transcriptPreview = transcript ? transcriptToPreview(transcript) : [];

  return {
    id,
    source: "fathom",
    recordingId,
    title,
    occurredAt: meeting.recording_start_time || meeting.scheduled_start_time || meeting.created_at,
    attendees,
    ownerEmail: meeting.recorded_by?.email,
    summary: cleanMarkdown(meeting.default_summary?.markdown_formatted),
    actionItems,
    transcript: transcript || undefined,
    transcriptPreview,
    videoUrl: meeting.share_url || meeting.url,
    sourceUrl: meeting.url || meeting.share_url
  };
}

function transcriptLinesToText(lines: FathomTranscriptLine[]) {
  return lines
    .map((line) => {
      const speaker = line.speaker?.display_name;
      const text = line.text;
      return [speaker ? `${speaker}:` : "", text].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("\n");
}

function transcriptToPreview(transcript: string) {
  return transcript.split("\n").filter(Boolean).slice(0, 10);
}

function cleanMarkdown(value?: string) {
  if (!value) {
    return undefined;
  }

  return value
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .trim();
}

function getLookbackDays() {
  const configured = Number(process.env.MEETING_LOOKBACK_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LOOKBACK_DAYS;
}

function normalizeFathomApiKey(value?: string) {
  const key = value?.trim();
  if (!key || key === "paste-your-work-fathom-api-key-here") {
    return undefined;
  }

  return key;
}
