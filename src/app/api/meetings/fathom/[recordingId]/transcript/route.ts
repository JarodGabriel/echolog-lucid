import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { fetchFathomTranscript } from "@/lib/fathom";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ recordingId: string }> }
) {
  if (!(await authenticated())) {
    return NextResponse.json({ error: "Sign in to Echolog Lucid." }, { status: 401 });
  }

  const { recordingId } = await params;
  if (!recordingId) {
    return NextResponse.json({ error: "Missing Fathom recording ID." }, { status: 400 });
  }

  try {
    const transcript = await fetchFathomTranscript(recordingId);
    return NextResponse.json({
      transcript,
      transcriptPreview: transcript.split("\n").filter(Boolean).slice(0, 10)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to fetch this transcript." },
      { status: 502 }
    );
  }
}
