/** One slide entry from TikTok vision analysis (Python script or OpenAI fallback). */
export type TikTokAnalysisSlide = {
  index?: number;
  scene_summary?: string;
  on_screen_text?: string;
  visual_elements?: string;
  role_in_sequence?: string;
};

export type TikTokOpenAiAnalysisShape = {
  overall_purpose?: string;
  audience_and_context?: string;
  narrative_arc?: string;
  tone_and_style?: string;
  slides?: TikTokAnalysisSlide[];
};

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Human-readable block for canvas overlay and slideshow-agent context
 * (mirrors test_scripts/analyze_tiktok_slideshow.py text report shape).
 */
export function formatTikTokOpenAiAnalysisToContextText(
  analysis: TikTokOpenAiAnalysisShape | Record<string, unknown>,
  meta?: { sourceUrl?: string; postTitle?: string; author?: string },
): string {
  const a = analysis as TikTokOpenAiAnalysisShape;
  const lines: string[] = [];

  lines.push("TikTok reference — extracted context");
  lines.push("=".repeat(48));
  if (meta?.sourceUrl) lines.push(`URL: ${meta.sourceUrl}`);
  if (meta?.postTitle) lines.push(`Title: ${meta.postTitle}`);
  if (meta?.author) lines.push(`Creator: ${meta.author}`);
  if (lines.length > 3) lines.push("");

  const purpose = str(a.overall_purpose);
  if (purpose) {
    lines.push("Overall purpose");
    lines.push("-".repeat(32));
    lines.push(purpose);
    lines.push("");
  }

  const aud = str(a.audience_and_context);
  if (aud) {
    lines.push("Audience and context");
    lines.push("-".repeat(32));
    lines.push(aud);
    lines.push("");
  }

  const arc = str(a.narrative_arc);
  if (arc) {
    lines.push("Narrative arc");
    lines.push("-".repeat(32));
    lines.push(arc);
    lines.push("");
  }

  const tone = str(a.tone_and_style);
  if (tone) {
    lines.push("Tone and style");
    lines.push("-".repeat(32));
    lines.push(tone);
    lines.push("");
  }

  const slides = Array.isArray(a.slides) ? a.slides : [];
  if (slides.length > 0) {
    lines.push("Slides / frames");
    lines.push("-".repeat(32));
    for (const s of slides) {
      const idx = s.index ?? "?";
      lines.push(`\n[${idx}] ${str(s.role_in_sequence)}`);
      const sum = str(s.scene_summary);
      if (sum) lines.push(`  Summary: ${sum}`);
      const ot = str(s.on_screen_text);
      if (ot) lines.push(`  On-screen text: ${ot}`);
      const vis = str(s.visual_elements);
      if (vis) lines.push(`  Visuals: ${vis}`);
    }
    lines.push("");
  }

  const out = lines.join("\n").trim();
  return out || "No structured analysis text was returned.";
}
