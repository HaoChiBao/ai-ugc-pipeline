import { createObjectUrl, revokeObjectUrl } from "@/lib/canvas/files";
import type {
  CanvasGroup,
  CanvasItem,
  ImageCanvasItem,
  TextCanvasItem,
} from "@/lib/canvas/types";
import { DEFAULT_CAPTION_FONT_PX } from "@/lib/canvas/types";
import type { SelectedPinterestSource } from "@/lib/canvas/pinterestSelection";
import type { SlideshowVisualSource } from "@/lib/canvas/slideshowVisualSources";

export async function blobForPinterestSource(
  ref: SelectedPinterestSource,
): Promise<Blob> {
  if (ref.kind === "image") {
    const res = await fetch(ref.item.src);
    if (!res.ok) {
      throw new Error("Could not read a selected canvas image");
    }
    return res.blob();
  }
  const thumb = ref.item.thumbnailUrl;
  if (!thumb?.trim()) {
    throw new Error("Pin thumbnail missing");
  }
  const proxied = `/api/pinterest/image-proxy?url=${encodeURIComponent(thumb)}`;
  const res = await fetch(proxied);
  if (!res.ok) {
    throw new Error("Could not download pin preview image");
  }
  return res.blob();
}

export async function blobForSlideshowVisualSource(
  ref: SlideshowVisualSource,
): Promise<Blob> {
  if (ref.kind === "tiktok") {
    const thumb = ref.item.thumbnailUrl;
    if (!thumb?.trim()) {
      throw new Error("TikTok thumbnail missing");
    }
    const proxied = `/api/pinterest/image-proxy?url=${encodeURIComponent(thumb)}`;
    const res = await fetch(proxied);
    if (!res.ok) {
      throw new Error("Could not download TikTok preview image");
    }
    return res.blob();
  }
  return blobForPinterestSource(ref);
}

type CaptionManifest = {
  slides?: Array<{ index: number; caption?: string }>;
};

function slideRelPath(index1Based: number): string {
  return `output/slide_${String(index1Based).padStart(2, "0")}.png`;
}

/** Uniform vertical TikTok-style tile: width : height = 9 : 16 */
export const CAPTIONED_SLIDE_FRAME_W = 270;
export const CAPTIONED_SLIDE_FRAME_H = Math.round(
  (CAPTIONED_SLIDE_FRAME_W * 16) / 9,
);

export type CaptionedSlideshowCanvasDeps = {
  prompt: string;
  sources: SlideshowVisualSource[];
  getCanvasViewportCenterWorld: () => { x: number; y: number };
  addItem: (item: CanvasItem) => void;
  addGroup: (group: CanvasGroup) => void;
};

/**
 * POST captioned slideshow job, fetch outputs, place images + attached captions on canvas.
 * Caller owns toast / loading UI.
 */
export type CaptionedSlideshowResult = {
  slideCount: number;
  groupId: string;
  /** Same blob URLs as placed images — valid until revoked by caller on error. */
  slidePreviewUrls: string[];
};

export async function placeCaptionedSlideshowOnCanvas(
  deps: CaptionedSlideshowCanvasDeps,
): Promise<CaptionedSlideshowResult> {
  const { prompt, sources, getCanvasViewportCenterWorld, addItem, addGroup } =
    deps;
  const p = prompt.trim();
  if (!p) {
    throw new Error("Generation brief is empty.");
  }
  if (sources.length === 0) {
    throw new Error(
      "Select at least one Pinterest pin, Pinterest-tagged image, or TikTok card with a loaded thumbnail.",
    );
  }

  const createdUrls: string[] = [];
  try {
    const fd = new FormData();
    fd.append("prompt", p);
    fd.append("no_text_overlay", "true");
    fd.append("provider", "openai");

    let fi = 0;
    for (const src of sources) {
      const blob = await blobForSlideshowVisualSource(src);
      const ext = blob.type.includes("png") ? "png" : "jpg";
      fd.append("images", blob, `pinterest_${fi++}.${ext}`);
    }

    const res = await fetch("/api/slideshow/captioned", {
      method: "POST",
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      job_id?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? "Slideshow failed");
    }
    const jobId = data.job_id;
    if (!jobId) {
      throw new Error("No job id in response");
    }

    const manRes = await fetch(
      `/api/test-scripts/runs/${encodeURIComponent(jobId)}/output/caption_manifest.json`,
    );
    if (!manRes.ok) {
      throw new Error("Could not load caption manifest");
    }
    const manifest = (await manRes.json()) as CaptionManifest;
    const slides = [...(manifest.slides ?? [])].sort(
      (a, b) => a.index - b.index,
    );
    if (slides.length === 0) {
      throw new Error("No slides in manifest");
    }

    const center = getCanvasViewportCenterWorld();
    const cols = Math.min(3, Math.max(1, slides.length));
    const gapX = 24;

    const slideGroupId = crypto.randomUUID();
    addGroup({
      id: slideGroupId,
      collapseCenterX: center.x,
      collapseCenterY: center.y - 140,
      label: "slideshow",
      expandedPinned: false,
      memberImageIds: [],
    });

    type Prepared = { caption: string; blobUrl: string };
    const slideData: Prepared[] = [];
    for (const s of slides) {
      const rel = slideRelPath(s.index);
      const imgRes = await fetch(
        `/api/test-scripts/runs/${encodeURIComponent(jobId)}/${rel}`,
      );
      if (!imgRes.ok) {
        throw new Error(`Slide ${s.index} could not be downloaded`);
      }
      const blob = await imgRes.blob();
      const blobUrl = createObjectUrl(blob);
      createdUrls.push(blobUrl);
      slideData.push({
        caption: String(s.caption ?? ""),
        blobUrl,
      });
    }

    let y = center.y - 200;
    const fw = CAPTIONED_SLIDE_FRAME_W;
    const fh = CAPTIONED_SLIDE_FRAME_H;

    for (let i = 0; i < slideData.length; ) {
      const rowCells: Prepared[] = [];
      for (let c = 0; c < cols && i < slideData.length; c++, i++) {
        rowCells.push(slideData[i]);
      }
      const rowWidth = rowCells.length * fw + (rowCells.length - 1) * gapX;
      let x = center.x - rowWidth / 2;

      for (const d of rowCells) {
        const imgId = crypto.randomUUID();
        const imgItem: ImageCanvasItem = {
          id: imgId,
          type: "image",
          x,
          y,
          width: fw,
          height: fh,
          src: d.blobUrl,
          imageObjectFit: "cover",
          groupId: slideGroupId,
        };
        addItem(imgItem);

        const textItem: TextCanvasItem = {
          id: crypto.randomUUID(),
          type: "text",
          x: 0,
          y: 0,
          width: Math.min(fw - 12, 252),
          height: 120,
          text: d.caption,
          fontSize: DEFAULT_CAPTION_FONT_PX,
          textAlign: "center",
          attachedToImageId: imgId,
          overlayFractionY: 0.14 + Math.random() * 0.62,
        };
        addItem(textItem);

        x += fw + gapX;
      }

      y += fh + 40;
    }

    return {
      slideCount: slides.length,
      groupId: slideGroupId,
      slidePreviewUrls: slideData.map((d) => d.blobUrl),
    };
  } catch (e) {
    for (const u of createdUrls) {
      revokeObjectUrl(u);
    }
    throw e;
  }
}
