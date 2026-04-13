import "server-only";

import { generateSlidesRequestSchema } from "@/lib/ai/schemas/generation";
import {
  buildAssetSummariesFromDbRows,
  mergeCanvasContext,
} from "@/lib/ai/context/buildCanvasAssetContext";
import { getCanvasAssetsByIds } from "@/lib/db/assets";
import type { GenerateSlidesRequest } from "@/lib/generation/types";

export async function enrichAndSanitizeRequest(
  projectId: string,
  body: unknown,
): Promise<GenerateSlidesRequest> {
  const req = generateSlidesRequestSchema.parse(body);

  const idSet = new Set<string>(req.selectedCanvasAssetIds ?? []);
  if (req.includeVisibleCanvasAssets && req.canvasContext?.assetSummaries) {
    for (const a of req.canvasContext.assetSummaries) {
      idSet.add(a.id);
    }
  }

  const ids = [...idSet];
  const rows = ids.length > 0 ? await getCanvasAssetsByIds(ids) : [];
  const filtered = rows.filter((r) => r.projectId === projectId);
  const selectedSet = new Set(req.selectedCanvasAssetIds ?? []);

  const summaries = buildAssetSummariesFromDbRows(filtered, {
    selectedIds: selectedSet,
    useSelectedOnly: Boolean(req.useSelectedCanvasAssets),
  });

  const forLlm = summaries.map((s) => ({
    id: s.id,
    label: s.label,
    note: s.note,
    mimeType: s.mimeType,
    width: s.width,
    height: s.height,
    x: s.x,
    y: s.y,
    selected: s.selected,
  }));

  const merged = mergeCanvasContext(req.canvasContext, forLlm);

  return {
    ...req,
    projectId,
    canvasContext: merged,
  };
}
