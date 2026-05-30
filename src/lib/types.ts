export type MeetingSource = "fathom" | "granola";

export type ConnectorStatus = {
  configured: boolean;
  connected: boolean;
  label: string;
  email?: string;
  error?: string;
};

export type MeetingNote = {
  id: string;
  source: MeetingSource;
  recordingId?: string;
  title: string;
  occurredAt?: string;
  attendees: string[];
  ownerEmail?: string;
  summary?: string;
  notes?: string;
  contentStatus?: string;
  actionItems: string[];
  transcript?: string;
  transcriptPreview: string[];
  videoUrl?: string;
  sourceUrl?: string;
};

export type MeetingsPayload = {
  generatedAt: string;
  meetings: MeetingNote[];
  connectors: {
    granola: ConnectorStatus;
    fathom: ConnectorStatus;
  };
};
