import { MeetingVaultApp } from "@/components/meeting-vault-app";
import type { MeetingsPayload } from "@/lib/types";

const staticPayload: MeetingsPayload = {
  generatedAt: "2026-05-30T19:15:00.000Z",
  connectors: {
    granola: {
      configured: true,
      connected: true,
      label: "Granola personal account"
    },
    fathom: {
      configured: true,
      connected: true,
      label: "Fathom work account"
    }
  },
  meetings: [
    {
      id: "granola-spotlight-1",
      source: "granola",
      title: "Northstar / Growth Planning",
      occurredAt: "2026-05-30T11:30:00-07:00",
      attendees: ["Jordan Lee", "Maya Chen", "Sam Rivera"],
      summary:
        "### Growth Priorities\n\n- Align launch messaging around speed, privacy, and mobile access\n- Package the app as a quick meeting-memory layer for busy operators\n- Keep the first release focused on search, recent notes, and recordings\n\n### Customer Signals\n\n- Users want meeting notes available away from their desk\n- Search needs to find exact spoken phrases, not only meeting titles\n- The mobile flow should feel fast enough for quick review between calls",
      notes:
        "### Positioning\n\nEcholog Lucid gives recent meeting notes, summaries, transcripts, and recordings a single mobile home.\n\n### Privacy\n\nThe app keeps meeting review focused and private, with account access controlled behind sign-in.",
      actionItems: [
        "Create a clean mobile walkthrough flow",
        "Highlight search across spoken transcript text",
        "Show Granola and Fathom together in the same feed"
      ],
      transcriptPreview: [],
      sourceUrl: "#granola-source"
    },
    {
      id: "fathom-spotlight-1",
      source: "fathom",
      recordingId: "1001",
      title: "Launch Review and Follow-ups",
      occurredAt: "2026-05-29T14:00:00-07:00",
      attendees: ["Avery Brooks", "Riley Stone", "Taylor Morgan", "Casey Vale"],
      summary:
        "### Launch Review\n\n- The team reviewed homepage messaging and mobile install flow\n- Fathom recordings should open from the meeting detail page\n- Transcript and summary should stay separated for faster scanning",
      notes:
        "### Decisions\n\n- Put transcript first for Fathom meetings\n- Keep summary behind a dedicated tab\n- Use highlighted search results to prove the exact phrase exists",
      actionItems: [
        "Avery: tighten the product walkthrough copy",
        "Riley: prepare short social video clips",
        "Casey: review recording links before launch"
      ],
      transcript:
        "Avery Brooks: Let's start with what matters on mobile.\nRiley Stone: The meeting list should be quick to scan and easy to search.\nTaylor Morgan: If someone said raise the budget by 5k, I want that exact meeting to appear.\nCasey Vale: Agreed. The phrase should be highlighted in the transcript so there is no guessing.\nAvery Brooks: We should keep the summary separate from the transcript.\nRiley Stone: And the recording link should be one tap away.",
      transcriptPreview: [
        "Avery Brooks: Let's start with what matters on mobile.",
        "Riley Stone: The meeting list should be quick to scan and easy to search.",
        "Taylor Morgan: If someone said raise the budget by 5k, I want that exact meeting to appear."
      ],
      videoUrl: "#recording",
      sourceUrl: "#fathom-source"
    },
    {
      id: "granola-spotlight-2",
      source: "granola",
      title: "Pipeline Check-in",
      occurredAt: "2026-05-28T09:15:00-07:00",
      attendees: ["Morgan Park", "Jamie Cole"],
      summary:
        "### Pipeline Notes\n\n- Prioritize accounts with recent product engagement\n- Review three open follow-ups before the end of the week\n- Move stale opportunities into a later nurture list",
      notes:
        "The team agreed that the mobile app should make lightweight review possible from anywhere, without requiring the laptop to be open.",
      actionItems: ["Review open follow-ups", "Update the priority account list", "Draft next-step notes"],
      transcriptPreview: [],
      sourceUrl: "#granola-source"
    },
    {
      id: "fathom-spotlight-2",
      source: "fathom",
      recordingId: "1002",
      title: "Product Feedback Review",
      occurredAt: "2026-05-27T13:45:00-07:00",
      attendees: ["Nina Patel", "Chris Allen", "Devon Kim"],
      summary:
        "### Feedback\n\n- Users understood the combined meeting feed quickly\n- The dark mobile interface felt polished for repeated use\n- Search was the strongest feature in the walkthrough",
      notes:
        "### Improvements\n\n- Add clearer empty states\n- Make account status easier to inspect\n- Record a short feature walkthrough for launch",
      actionItems: ["Polish the mobile walkthrough", "Record a short feature walkthrough", "Review the mobile search flow"],
      transcript:
        "Nina Patel: The combined feed makes sense immediately.\nChris Allen: I like that Granola notes and Fathom transcripts sit together.\nDevon Kim: The search highlight is the moment people will understand the value.",
      transcriptPreview: [
        "Nina Patel: The combined feed makes sense immediately.",
        "Chris Allen: I like that Granola notes and Fathom transcripts sit together.",
        "Devon Kim: The search highlight is the moment people will understand the value."
      ],
      videoUrl: "#recording",
      sourceUrl: "#fathom-source"
    },
    {
      id: "granola-spotlight-3",
      source: "granola",
      title: "Morning Priorities",
      occurredAt: "2026-05-26T08:30:00-07:00",
      attendees: ["Alex Reed"],
      summary:
        "### Priorities\n\n- Check recent notes before the first call\n- Review action items from the previous afternoon\n- Keep the mobile workflow fast and private",
      actionItems: ["Scan recent action items", "Confirm today's prep list"],
      transcriptPreview: [],
      sourceUrl: "#granola-source"
    },
    {
      id: "fathom-spotlight-3",
      source: "fathom",
      recordingId: "1003",
      title: "Implementation Sync",
      occurredAt: "2026-05-25T15:15:00-07:00",
      attendees: ["Harper Quinn", "Logan Shaw"],
      summary:
        "### Implementation\n\n- Keep authentication private\n- Cache recent notes on-device\n- Make recording links easy to open from the detail screen",
      actionItems: ["Verify cached loading states", "Review mobile detail navigation"],
      transcript:
        "Harper Quinn: The app should feel like a real mobile tool, not a dashboard squeezed onto a phone.\nLogan Shaw: The back and next buttons make quick review easier.",
      transcriptPreview: [
        "Harper Quinn: The app should feel like a real mobile tool, not a dashboard squeezed onto a phone.",
        "Logan Shaw: The back and next buttons make quick review easier."
      ],
      videoUrl: "#recording",
      sourceUrl: "#fathom-source"
    }
  ]
};

export default function ShowcasePage() {
  return <MeetingVaultApp staticMode staticPayload={staticPayload} />;
}
