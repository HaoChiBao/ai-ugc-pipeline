import {
  blobForPinterestSource,
  blobForSlideshowVisualSource,
} from "@/lib/canvas/captionedSlideshowToCanvas";
import type { SelectedPinterestSource } from "@/lib/canvas/pinterestSelection";
import type { SlideshowVisualSource } from "@/lib/canvas/slideshowVisualSources";

export type AgentReferencePayload = {
  id: string;
  label: string;
  mediaType: string;
  base64: string;
};

async function blobToResizedJpegBase64(
  blob: Blob,
  maxDim: number,
): Promise<{ base64: string; mediaType: string }> {
  const bmp = await createImageBitmap(blob);
  try {
    const w = bmp.width;
    const h = bmp.height;
    const scale = Math.min(1, maxDim / Math.max(w, h, 1));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Could not get canvas context");
    }
    ctx.drawImage(bmp, 0, 0, cw, ch);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    const comma = dataUrl.indexOf(",");
    if (comma === -1) {
      throw new Error("Invalid data URL");
    }
    return { base64: dataUrl.slice(comma + 1), mediaType: "image/jpeg" };
  } finally {
    bmp.close();
  }
}

/**
 * Encode selected Pinterest / pin-tagged images for the planning agent (vision).
 * Runs in the browser; resizes to limit payload size.
 */
export async function buildSlideshowAgentReferenceImages(
  sources: SelectedPinterestSource[],
  maxItems = 8,
  maxDim = 768,
): Promise<AgentReferencePayload[]> {
  const slice = sources.slice(0, maxItems);
  const out: AgentReferencePayload[] = [];
  for (const src of slice) {
    const blob = await blobForPinterestSource(src);
    const { base64, mediaType } = await blobToResizedJpegBase64(blob, maxDim);
    const id = src.item.id;
    const label =
      src.kind === "image"
        ? `Canvas image id=${id}${src.item.label ? ` (${src.item.label})` : ""}`
        : `Pinterest card id=${id} — ${src.item.title?.slice(0, 56)?.trim() || "pin"}`;
    out.push({ id, label, mediaType, base64 });
  }
  return out;
}

/**
 * Pinterest / pin-tagged images plus TikTok cards (thumbnail + optional analysis
 * in the label) for the planning agent.
 */
export async function buildSlideshowAgentReferences(
  sources: SlideshowVisualSource[],
  maxItems = 10,
  maxDim = 768,
): Promise<AgentReferencePayload[]> {
  const slice = sources.slice(0, maxItems);
  const out: AgentReferencePayload[] = [];
  for (const src of slice) {
    const blob = await blobForSlideshowVisualSource(src);
    const { base64, mediaType } = await blobToResizedJpegBase64(blob, maxDim);
    const id = src.item.id;
    let label: string;
    if (src.kind === "tiktok") {
      const t = src.item;
      const title = t.title?.slice(0, 48)?.trim() || "TikTok";
      const ctxSnippet = t.analysisContextText?.trim();
      const ctxPart = ctxSnippet
        ? ` | Analysis: ${ctxSnippet.slice(0, 380)}${ctxSnippet.length > 380 ? "…" : ""}`
        : "";
      label = `TikTok card id=${id} — ${title}${ctxPart}`;
    } else if (src.kind === "image") {
      label = `Canvas image id=${id}${src.item.label ? ` (${src.item.label})` : ""}`;
    } else {
      label = `Pinterest card id=${id} — ${src.item.title?.slice(0, 56)?.trim() || "pin"}`;
    }
    out.push({ id, label, mediaType, base64 });
  }
  return out;
}
