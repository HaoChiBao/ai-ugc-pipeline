import type { CanvasItem, ImageCanvasItem } from "@/lib/canvas/types";
import type { GenerateSlidesRequest } from "@/lib/generation/types";
import type { ViewportState } from "@/lib/canvas/types";

export type GenerationControlValues = {
  mode: "grounded" | "creative";
  stylePreset: string;
  tone: string;
  slideCount: number;
  useSelectedCanvasAssets: boolean;
  includeVisibleCanvasAssets: boolean;
  generateVisuals: boolean;
};

const DEFAULT_CONTROLS: GenerationControlValues = {
  mode: "creative",
  stylePreset: "",
  tone: "",
  slideCount: 7,
  useSelectedCanvasAssets: true,
  includeVisibleCanvasAssets: false,
  generateVisuals: false,
};

export function defaultGenerationControls(): GenerationControlValues {
  return { ...DEFAULT_CONTROLS };
}

export function buildGenerateSlidesRequest(input: {
  theme: string;
  controls: GenerationControlValues;
  items: CanvasItem[];
  selectedIds: string[];
  viewport: ViewportState;
  projectId: string | null;
}): GenerateSlidesRequest {
  const images = input.items.filter(
    (i): i is ImageCanvasItem => i.type === "image",
  );

  const selectedImages = images.filter((i) => input.selectedIds.includes(i.id));
  const selectedCanvasAssetIds = selectedImages
    .map((i) => i.canvasAssetId)
    .filter((id): id is string => Boolean(id));

  const assetSummaries = images
    .filter((i) => i.canvasAssetId)
    .map((i) => ({
      id: i.canvasAssetId as string,
      mimeType: i.mimeType,
      width: Math.round(i.width),
      height: Math.round(i.height),
      x: Math.round(i.x),
      y: Math.round(i.y),
      selected: input.selectedIds.includes(i.id),
      label: i.label,
      note: i.note,
    }));

  return {
    projectId: input.projectId ?? undefined,
    theme: input.theme.trim(),
    mode: input.controls.mode,
    stylePreset: input.controls.stylePreset || undefined,
    tone: input.controls.tone || undefined,
    slideCount: input.controls.slideCount,
    useSelectedCanvasAssets: input.controls.useSelectedCanvasAssets,
    includeVisibleCanvasAssets: input.controls.includeVisibleCanvasAssets,
    generateVisuals: input.controls.generateVisuals,
    selectedCanvasAssetIds:
      selectedCanvasAssetIds.length > 0
        ? selectedCanvasAssetIds
        : undefined,
    canvasContext: {
      viewport: {
        x: input.viewport.panX,
        y: input.viewport.panY,
        zoom: input.viewport.zoom,
      },
      assetSummaries,
    },
  };
}
