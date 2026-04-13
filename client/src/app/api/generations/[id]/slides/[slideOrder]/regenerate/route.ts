import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "Single-slide regeneration is not implemented yet" },
    { status: 501 },
  );
}
