import type {
  CanvasItem,
  CanvasItemPatch,
  ImageCanvasItem,
} from "@/lib/canvas/types";

async function resolveProjectId(
  projectId: string | null,
  setProjectId: (id: string) => void,
): Promise<string> {
  if (projectId) return projectId;
  const res = await fetch("/api/projects/ensure");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      hint?: string;
    };
    const msg =
      [body.error, body.hint].filter(Boolean).join("\n\n") ||
      `Could not resolve project (${res.status})`;
    throw new Error(msg);
  }
  const data = (await res.json()) as { id: string };
  setProjectId(data.id);
  return data.id;
}

export async function ensureCanvasAssetsUploaded(input: {
  items: CanvasItem[];
  imageItemIds: string[];
  projectId: string | null;
  setProjectId: (id: string) => void;
  patchItem: (id: string, patch: CanvasItemPatch) => void;
}): Promise<string> {
  let projectId = await resolveProjectId(
    input.projectId,
    input.setProjectId,
  );

  for (const id of input.imageItemIds) {
    const item = input.items.find(
      (i): i is ImageCanvasItem => i.type === "image" && i.id === id,
    );
    if (!item || item.canvasAssetId) continue;

    const blob = await fetch(item.src).then((r) => r.blob());
    const fd = new FormData();
    fd.append("file", blob, "canvas-image");
    if (projectId) fd.append("projectId", projectId);

    const res = await fetch("/api/canvas-assets", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Upload failed (${res.status})`);
    }
    const data = (await res.json()) as {
      id: string;
      projectId: string;
      storagePath: string;
      mimeType: string;
    };
    if (!projectId) {
      projectId = data.projectId;
      input.setProjectId(data.projectId);
    }
    input.patchItem(id, {
      canvasAssetId: data.id,
      storagePath: data.storagePath,
      mimeType: data.mimeType,
    });
  }

  return projectId;
}
