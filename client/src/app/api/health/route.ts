import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Lightweight health check for Vercel / uptime monitors. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "ai-ugc-canvas",
    api: "nextjs",
  });
}
