import type { CanvasAsset } from "@/lib/db/schema";
import type { GenerateSlidesRequest } from "@/lib/generation/types";

const MAX_ASSETS = 12;

export type AssetSummary = NonNullable<
  GenerateSlidesRequest["canvasContext"]
>["assetSummaries"][number];

export function buildAssetSummariesFromDbRows(
  rows: CanvasAsset[],
  options: {
    selectedIds: Set<string>;
    useSelectedOnly: boolean;
    includeAllWhenVisible?: boolean;
  },
): AssetSummary[] {
  let list = rows.map((r) => ({
    id: r.id,
    publicUrl: r.publicUrl ?? undefined,
    storagePath: r.storagePath,
    bucket: r.bucket,
    mimeType: r.mimeType,
    width: r.width ?? undefined,
    height: r.height ?? undefined,
    x: r.x ?? undefined,
    y: r.y ?? undefined,
    selected: options.selectedIds.has(r.id),
    label: r.label ?? undefined,
    note: r.note ?? undefined,
  }));

  if (options.useSelectedOnly) {
    list = list.filter((a) => a.selected);
  }

  list.sort((a, b) => {
    if (a.selected === b.selected) return 0;
    return a.selected ? -1 : 1;
  });

  return list.slice(0, MAX_ASSETS);
}

export function mergeCanvasContext(
  base: GenerateSlidesRequest["canvasContext"] | undefined,
  summaries: AssetSummary[],
  viewport?: { panX: number; panY: number; zoom: number },
): NonNullable<GenerateSlidesRequest["canvasContext"]> {
  return {
    ...base,
    viewport: base?.viewport ?? {
      x: viewport?.panX ?? 0,
      y: viewport?.panY ?? 0,
      zoom: viewport?.zoom ?? 1,
    },
    assetSummaries: summaries,
  };
}
