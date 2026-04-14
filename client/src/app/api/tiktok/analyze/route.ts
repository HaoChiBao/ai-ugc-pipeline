import { NextResponse } from "next/server";
import OpenAI from "openai";
import { normalizeTikTokUrl } from "@/lib/url-nodes/tiktok/validateTikTokUrl";
import {
  formatTikTokOpenAiAnalysisToContextText,
  type TikTokOpenAiAnalysisShape,
} from "@/lib/url-nodes/tiktok/formatTikTokAnalysisContext";

export const runtime = "nodejs";

/** Long-running: gallery-dl + multi-image vision upstream */
export const maxDuration = 300;

const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://www.tiktok.com/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
} as const;

function testScriptsBase(): string {
  return (
    process.env.TEST_SCRIPTS_API_URL?.trim() ||
    process.env.TEST_SCRIPTS_API_BASE?.trim() ||
    "http://127.0.0.1:8765"
  );
}

type OembedShape = {
  title?: string;
  thumbnail_url?: string;
  author_name?: string;
};

async function fetchTikTokOembed(canonicalUrl: string): Promise<OembedShape> {
  const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(canonicalUrl)}`;
  const upstream = await fetch(oembedUrl, {
    headers: BROWSER_HEADERS,
    signal: AbortSignal.timeout(20_000),
  });
  if (!upstream.ok) return {};
  try {
    return (await upstream.json()) as OembedShape;
  } catch {
    return {};
  }
}

async function fetchThumbnailAsDataUrl(
  thumbnailUrl: string,
): Promise<string | null> {
  const trimmed = thumbnailUrl.trim();
  if (!trimmed) return null;
  let target: URL;
  try {
    target = new URL(trimmed);
  } catch {
    return null;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") {
    return null;
  }
  const res = await fetch(target.toString(), {
    headers: BROWSER_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") ?? "image/jpeg";
  if (!ct.startsWith("image/")) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const b64 = buf.toString("base64");
  return `data:${ct};base64,${b64}`;
}

function pickManifestAnalysis(manifests: unknown): {
  analysis: Record<string, unknown>;
  sourceUrl?: string;
  postTitle?: string;
  author?: string;
} | null {
  if (!manifests || typeof manifests !== "object") return null;
  for (const raw of Object.values(manifests as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    const openai = m.openai_analysis;
    if (openai && typeof openai === "object") {
      const meta = m.post_metadata;
      let postTitle: string | undefined;
      let author: string | undefined;
      if (meta && typeof meta === "object") {
        const pm = meta as Record<string, unknown>;
        if (typeof pm.title === "string") postTitle = pm.title;
        if (typeof pm.uploader === "string") author = pm.uploader;
        if (!author && typeof pm.author_name === "string") {
          author = pm.author_name;
        }
      }
      return {
        analysis: openai as Record<string, unknown>,
        sourceUrl: typeof m.source_url === "string" ? m.source_url : undefined,
        postTitle,
        author,
      };
    }
  }
  return null;
}

const FALLBACK_JSON_INSTRUCTIONS = `Return a single JSON object with exactly these keys:
- "overall_purpose": string — what this post seems to accomplish (1–3 sentences; if you only see one frame, say so).
- "audience_and_context": string — likely audience and niche.
- "narrative_arc": string — how the post might build (hook → value → CTA) or "unknown from single frame".
- "tone_and_style": string — pacing, visual style, caption patterns you infer.
- "slides": array with exactly one object:
    - "index": 1
    - "scene_summary": string — describe the visible frame
    - "on_screen_text": string — visible text or ""
    - "visual_elements": string — subjects, setting, composition
    - "role_in_sequence": string — e.g. "thumbnail / cover frame"`;

async function analyzeWithOpenAiFallback(
  canonicalUrl: string,
): Promise<{ contextText: string; analysis: TikTokOpenAiAnalysisShape }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const model =
    process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o-mini";
  const oembed = await fetchTikTokOembed(canonicalUrl);
  const title = oembed.title?.trim() || "";
  const author = oembed.author_name?.trim() || "";
  let dataUrl: string | null = null;
  if (oembed.thumbnail_url) {
    dataUrl = await fetchThumbnailAsDataUrl(oembed.thumbnail_url);
  }

  const intro =
    "You analyze TikTok posts for a creative slideshow planner.\n\n" +
    `Post URL: ${canonicalUrl}\n` +
    (title ? `oEmbed title: ${title}\n` : "") +
    (author ? `Creator: ${author}\n` : "") +
    (dataUrl
      ? "You are given one thumbnail image (cover frame).\n\n"
      : "No thumbnail image could be loaded — infer only from metadata.\n\n") +
    FALLBACK_JSON_INSTRUCTIONS;

  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [
    { type: "text", text: intro },
  ];
  if (dataUrl) {
    userContent.push({
      type: "image_url",
      image_url: { url: dataUrl, detail: "low" },
    });
  }

  const client = new OpenAI({ apiKey: key });
  const resp = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You output only valid JSON objects matching the user schema.",
      },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    temperature: 0.35,
  });
  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty content");
  const parsed = JSON.parse(raw) as TikTokOpenAiAnalysisShape;
  const contextText = formatTikTokOpenAiAnalysisToContextText(parsed, {
    sourceUrl: canonicalUrl,
    postTitle: title || undefined,
    author: author || undefined,
  });
  return { contextText, analysis: parsed };
}

/**
 * Full carousel analysis via test_scripts FastAPI (gallery-dl + vision), or
 * OpenAI thumbnail+metadata fallback when upstream fails or is unavailable.
 */
export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  const canonical = normalizeTikTokUrl(rawUrl);
  if (!canonical) {
    return NextResponse.json({ error: "Invalid TikTok URL" }, { status: 400 });
  }

  const base = testScriptsBase().replace(/\/$/, "");

  try {
    const upstream = await fetch(`${base}/v1/tiktok/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: canonical, image_detail: "low" }),
      signal: AbortSignal.timeout(600_000),
    });
    const data = (await upstream.json().catch(() => ({}))) as {
      ok?: boolean;
      exit_code?: number;
      error?: string;
      manifests?: Record<string, unknown>;
      stderr?: string;
    };

    if (upstream.ok && data.ok !== false && (data.exit_code ?? 0) === 0) {
      const picked = pickManifestAnalysis(data.manifests);
      if (picked) {
        const contextText = formatTikTokOpenAiAnalysisToContextText(
          picked.analysis,
          {
            sourceUrl: picked.sourceUrl ?? canonical,
            postTitle: picked.postTitle,
            author: picked.author,
          },
        );
        return NextResponse.json({
          source: "fastapi",
          contextText,
          analysis: picked.analysis,
        });
      }
    }
  } catch {
    /* try OpenAI fallback */
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json(
      {
        error:
          "TikTok analysis failed (start test_scripts API for full carousel analysis) and OPENAI_API_KEY is missing for thumbnail fallback.",
      },
      { status: 503 },
    );
  }

  try {
    const { contextText, analysis } = await analyzeWithOpenAiFallback(
      canonical,
    );
    return NextResponse.json({
      source: "openai_fallback",
      contextText,
      analysis,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
