import { NextResponse } from "next/server";
import { z } from "zod";
import { runSlideshowPlanAgent } from "@/lib/ai/agents/slideshowPlanAgent";

export const runtime = "nodejs";

const MISSING_KEY_MESSAGE =
  "OpenAI API key is missing. Add OPENAI_API_KEY to client/.env.local (e.g. OPENAI_API_KEY=sk-...) and restart the dev server.";

const referenceSchema = z.object({
  id: z.string().min(1).max(256),
  label: z.string().min(1).max(600),
  mediaType: z.string().min(1).max(64),
  base64: z.string().min(1).max(6_000_000),
});

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1)
    .max(40),
  references: z.array(referenceSchema).max(12).optional(),
});

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: MISSING_KEY_MESSAGE }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body: messages[] required" },
      { status: 400 },
    );
  }

  try {
    const result = await runSlideshowPlanAgent(parsed.data.messages, {
      references: parsed.data.references,
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Agent failed";
    if (msg === "OPENAI_API_KEY is not set") {
      return NextResponse.json({ error: MISSING_KEY_MESSAGE }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
