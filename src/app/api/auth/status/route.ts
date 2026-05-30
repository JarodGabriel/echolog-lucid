import { NextResponse } from "next/server";
import { authenticated, passwordEnabled } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    passwordEnabled: passwordEnabled(),
    authenticated: await authenticated()
  });
}
