"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import {
  buildExpandedGridLayout,
  computeGroupLayoutMap,
  collapsedStackHit,
  findMergeTargetGroupId,
  findTopImageUnderWorldPoint,
  groupImageBoundsForMemberIds,
  resolveExistingGroupIdForMember,
  isGroupMemberItem,
  worldAabbOverlap,
} from "@/lib/canvas/groupLayout";
import { itemIntersectsWorldRect } from "@/lib/canvas/intersects";
import { screenToWorld } from "@/lib/canvas/transforms";
import {
  computeInitialImageSize,
  computePinterestThumbnailFrameSize,
} from "@/lib/canvas/imageSizing";
import {
  createObjectUrl,
  loadImageNaturalSize,
  revokeObjectUrl,
} from "@/lib/canvas/files";
import {
  DEFAULT_TIKTOK_NODE_HEIGHT,
  DEFAULT_TIKTOK_NODE_WIDTH,
  DEFAULT_ZOOM,
  type CanvasGroup,
  type CanvasItem,
  type ImageCanvasItem,
  type PinterestCanvasItem,
  type PinterestSimilarRequest,
  type TikTokCanvasItem,
  type ViewportState,
} from "@/lib/canvas/types";
import { useCanvasWorkspace } from "@/components/canvas/CanvasWorkspaceContext";
import { useCanvasPaste } from "@/hooks/canvas/useCanvasPaste";
import { useCanvasFileInput } from "@/hooks/canvas/useCanvasFileInput";
import { useCanvasDrop } from "@/hooks/canvas/useCanvasDrop";
import { fetchPinterestPreview } from "@/lib/url-nodes/pinterest/fetchPinterestPreview";
import {
  normalizePinterestUrl,
} from "@/lib/url-nodes/pinterest/validatePinterestUrl";
import { fetchTikTokPreview } from "@/lib/url-nodes/tiktok/fetchTikTokPreview";
import { normalizeTikTokUrl } from "@/lib/url-nodes/tiktok/validateTikTokUrl";
import { looksLikeWebUrl } from "@/lib/url-nodes/looksLikeWebUrl";
import { CanvasGroupMergeHighlight } from "./CanvasGroupMergeHighlight";
import { CanvasPairGroupHighlight } from "./CanvasPairGroupHighlight";
import { CanvasGroupNavigator } from "./CanvasGroupNavigator";
import { CanvasGroupOverlays } from "./CanvasGroupOverlays";
import { CanvasViewport } from "./CanvasViewport";
import { CanvasItemsLayer } from "./CanvasItemsLayer";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasDropOverlay } from "./CanvasDropOverlay";
import { PinterestSearchDialog } from "./PinterestSearchDialog";
import { PinterestUrlDialog } from "./PinterestUrlDialog";
import { TikTokUrlDialog } from "./TikTokUrlDialog";
import {
  ImageTextEditorPanel,
  type CanvasTextEditSubject,
} from "./ImageTextEditorPanel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Placement =
  | { kind: "center" }
  | { kind: "point"; screenX: number; screenY: number };

export function InfiniteCanvas() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<CanvasItem[]>([]);
  const viewportStateRef = useRef<ViewportState>({
    panX: 0,
    panY: 0,
    zoom: DEFAULT_ZOOM,
  });
  const [tiktokDialogOpen, setTiktokDialogOpen] = useState(false);
  const [pinterestDialogOpen, setPinterestDialogOpen] = useState(false);
  const [pinterestSearchDialogOpen, setPinterestSearchDialogOpen] =
    useState(false);
  const [textEditTarget, setTextEditTarget] = useState<
    | { kind: "image"; id: string }
    | { kind: "pinterest"; id: string }
    | null
  >(null);
  const [marqueeBox, setMarqueeBox] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const marqueeStartRef = useRef<{ sx: number; sy: number } | null>(null);
  const {
    viewport,
    panBy,
    zoomAtPoint,
    setPan,
    resetView,
    items,
    groups,
    selectedIds,
    addItem,
    addGroup,
    removeItem,
    removeItems,
    patchItem,
    patchGroup,
    mergeImageOntoTarget,
    select,
    selectMany,
    undo,
    redo,
    canUndo,
    canRedo,
    setCanvasViewportCenterWorldGetter,
    registerFocusGroupHandler,
  } = useCanvasWorkspace();

  const [viewportPx, setViewportPx] = useState({ w: 800, h: 600 });
  const [hoverPreviewGroupId, setHoverPreviewGroupId] = useState<string | null>(
    null,
  );
  const [mergeHoverGroupId, setMergeHoverGroupId] = useState<string | null>(
    null,
  );
  const [activeFreeDragImageIds, setActiveFreeDragImageIds] = useState<
    Set<string>
  >(() => new Set());
  const pairGroupDwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pairGroupDwellTargetRef = useRef<string | null>(null);
  const pairGroupReadyRef = useRef(false);
  const [pairGroupHighlightImageId, setPairGroupHighlightImageId] = useState<
    string | null
  >(null);
  const [similarPinForImageId, setSimilarPinForImageId] = useState<
    string | null
  >(null);
  const [similarPinUrlInput, setSimilarPinUrlInput] = useState("");

  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const overlayLayoutMap = useMemo(
    () =>
      computeGroupLayoutMap(items, groups, viewport, viewportPx, null),
    [items, groups, viewport, viewportPx],
  );

  const layoutMapNoHover = useMemo(
    () =>
      computeGroupLayoutMap(items, groups, viewport, viewportPx, null),
    [items, groups, viewport, viewportPx],
  );

  useEffect(() => {
    const attachedTextIds = new Set(
      items
        .filter((i) => {
          if (i.type !== "text") return false;
          const t = i as {
            attachedToImageId?: string;
            attachedToPinterestItemId?: string;
          };
          return Boolean(
            t.attachedToImageId || t.attachedToPinterestItemId,
          );
        })
        .map((i) => i.id),
    );
    const next = selectedIds.filter((id) => !attachedTextIds.has(id));
    if (next.length === selectedIds.length) return;
    selectMany(next);
  }, [items, selectedIds, selectMany]);

  const textEditSubjectResolved = useMemo((): CanvasTextEditSubject | null => {
    if (!textEditTarget) return null;
    if (textEditTarget.kind === "image") {
      const item = items.find(
        (i): i is ImageCanvasItem =>
          i.id === textEditTarget.id && i.type === "image",
      );
      return item ? { kind: "image", item } : null;
    }
    const item = items.find(
      (i): i is PinterestCanvasItem =>
        i.id === textEditTarget.id && i.type === "pinterest",
    );
    return item ? { kind: "pinterest", item } : null;
  }, [items, textEditTarget]);

  useEffect(() => {
    if (textEditTarget && !textEditSubjectResolved) {
      setTextEditTarget(null);
    }
  }, [textEditTarget, textEditSubjectResolved]);

  itemsRef.current = items;
  viewportStateRef.current = viewport;

  useLayoutEffect(() => {
    for (const g of groups) {
      if (!g.expandedPinned) continue;
      const n = g.memberImageIds.length;
      if (n === 0) continue;
      const byId = new Map(items.map((i) => [i.id, i]));
      const members = g.memberImageIds
        .map((id) => byId.get(id))
        .filter((i) => isGroupMemberItem(i));
      if (members.length !== n) continue;
      if (g.expandedGrid?.memberCount === n) continue;

      const { layout, positions } = buildExpandedGridLayout(
        members,
        g.collapseCenterX,
        g.collapseCenterY,
      );
      for (const mid of g.memberImageIds) {
        const p = positions.get(mid);
        if (p) patchItem(mid, { x: p.x, y: p.y });
      }
      patchGroup(g.id, { expandedGrid: layout });
    }
  }, [groups, items, patchGroup, patchItem]);

  useLayoutEffect(() => {
    setCanvasViewportCenterWorldGetter(() => {
      const el = viewportRef.current;
      if (!el) return { x: 0, y: 0 };
      const r = el.getBoundingClientRect();
      return screenToWorld(
        r.width / 2,
        r.height / 2,
        viewportStateRef.current,
      );
    });
    return () => {
      setCanvasViewportCenterWorldGetter(() => ({ x: 0, y: 0 }));
    };
  }, [setCanvasViewportCenterWorldGetter]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setViewportPx({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onMove = (e: PointerEvent) => {
      if (e.buttons & 1) return;
      const rect = el.getBoundingClientRect();
      const v = viewportStateRef.current;
      const wpt = screenToWorld(
        e.clientX - rect.left,
        e.clientY - rect.top,
        v,
      );
      const wx = wpt.x;
      const wy = wpt.y;
      const mapCollapsedProbe = computeGroupLayoutMap(
        itemsRef.current,
        groups,
        v,
        viewportPx,
        null,
      );
      let hit: string | null = null;
      for (const g of [...groups].reverse()) {
        if (g.expandedPinned) continue;
        if (
          collapsedStackHit(g, wx, wy, itemsRef.current, mapCollapsedProbe)
        ) {
          hit = g.id;
          break;
        }
      }
      setHoverPreviewGroupId(hit);
    };
    el.addEventListener("pointermove", onMove, { capture: true });
    return () =>
      el.removeEventListener("pointermove", onMove, { capture: true });
  }, [groups, viewportPx]);

  const clearPairGroupDwell = useCallback(() => {
    if (pairGroupDwellTimerRef.current !== null) {
      clearTimeout(pairGroupDwellTimerRef.current);
      pairGroupDwellTimerRef.current = null;
    }
    pairGroupDwellTargetRef.current = null;
    pairGroupReadyRef.current = false;
    setPairGroupHighlightImageId(null);
  }, []);

  const onMergeDrop = useCallback(
    (draggedId: string, wx: number, wy: number) => {
      const itemsNow = itemsRef.current;
      const groupsNow = groupsRef.current;
      const v = viewportStateRef.current;
      const map = computeGroupLayoutMap(
        itemsNow,
        groupsNow,
        v,
        viewportPx,
        hoverPreviewGroupId,
      );
      const dragged = itemsNow.find(
        (i) =>
          i.id === draggedId &&
          (i.type === "image" || i.type === "pinterest"),
      );
      const hit = findTopImageUnderWorldPoint(
        itemsNow,
        map,
        draggedId,
        wx,
        wy,
      );

      if (hit && dragged) {
        const bothUngrouped = !dragged.groupId && !hit.groupId;
        if (bothUngrouped) {
          if (
            pairGroupReadyRef.current &&
            pairGroupDwellTargetRef.current === hit.id
          ) {
            mergeImageOntoTarget(draggedId, hit.id);
            clearPairGroupDwell();
            return;
          }
          clearPairGroupDwell();
          // Do not return: drop may still be over a group (e.g. behind this
          // ungrouped image, or expanded grid gap) — pair-merge still needs dwell.
        } else {
          mergeImageOntoTarget(draggedId, hit.id);
          clearPairGroupDwell();
          return;
        }
      } else {
        clearPairGroupDwell();
      }

      const mergeGid = findMergeTargetGroupId(
        draggedId,
        wx,
        wy,
        itemsNow,
        groupsNow,
        v,
        viewportPx,
      );
      if (mergeGid) {
        patchItem(draggedId, { groupId: mergeGid });
      }
    },
    [
      clearPairGroupDwell,
      hoverPreviewGroupId,
      mergeImageOntoTarget,
      patchItem,
      viewportPx,
    ],
  );

  const onImageDragWorldMove = useCallback(
    (draggedId: string, wx: number, wy: number) => {
      const itemsNow = itemsRef.current;
      const groupsNow = groupsRef.current;
      const v = viewportStateRef.current;
      const map = computeGroupLayoutMap(
        itemsNow,
        groupsNow,
        v,
        viewportPx,
        null,
      );
      const dragged = itemsNow.find(
        (i) =>
          i.id === draggedId &&
          (i.type === "image" || i.type === "pinterest"),
      );
      const hit = findTopImageUnderWorldPoint(
        itemsNow,
        map,
        draggedId,
        wx,
        wy,
      );

      if (dragged && hit && !dragged.groupId && !hit.groupId) {
        if (pairGroupDwellTargetRef.current !== hit.id) {
          if (pairGroupDwellTimerRef.current !== null) {
            clearTimeout(pairGroupDwellTimerRef.current);
            pairGroupDwellTimerRef.current = null;
          }
          pairGroupDwellTargetRef.current = hit.id;
          pairGroupReadyRef.current = false;
          setPairGroupHighlightImageId(null);
          const targetId = hit.id;
          pairGroupDwellTimerRef.current = setTimeout(() => {
            pairGroupReadyRef.current = true;
            setPairGroupHighlightImageId(targetId);
          }, 480);
        }
      } else {
        if (pairGroupDwellTimerRef.current !== null) {
          clearTimeout(pairGroupDwellTimerRef.current);
          pairGroupDwellTimerRef.current = null;
        }
        pairGroupDwellTargetRef.current = null;
        pairGroupReadyRef.current = false;
        setPairGroupHighlightImageId(null);
      }

      const gid = findMergeTargetGroupId(
        draggedId,
        wx,
        wy,
        itemsNow,
        groupsNow,
        v,
        viewportPx,
      );
      setMergeHoverGroupId((prev) => (prev === gid ? prev : gid));
    },
    [viewportPx],
  );

  const onImageDragWorldStart = useCallback((id: string) => {
    setActiveFreeDragImageIds(new Set([id]));
  }, []);

  const onImageMultiDragStart = useCallback((ids: string[]) => {
    setActiveFreeDragImageIds(new Set(ids));
  }, []);

  const onImageDragWorldEnd = useCallback(() => {
    setMergeHoverGroupId(null);
    setActiveFreeDragImageIds(new Set());
    clearPairGroupDwell();
  }, [clearPairGroupDwell]);

  const onRequestSimilarPinUrl = useCallback((imageId: string) => {
    setSimilarPinForImageId(imageId);
    setSimilarPinUrlInput("");
  }, []);

  const onGroupMemberDragEnd = useCallback(
    (imageId: string, finalX: number, finalY: number, iw: number, ih: number) => {
      window.setTimeout(() => {
        const docItems = itemsRef.current;
        const docGroups = groupsRef.current;
        const it = docItems.find(
          (i) =>
            i.id === imageId &&
            (i.type === "image" || i.type === "pinterest"),
        );
        if (!it?.groupId) return;
        const g = docGroups.find((x) => x.id === it.groupId);
        if (!g?.expandedPinned) return;
        const others = g.memberImageIds.filter((id) => id !== imageId);
        if (others.length === 0) return;
        const boxOthers = groupImageBoundsForMemberIds(docItems, others);
        if (!boxOthers) return;
        if (
          !worldAabbOverlap(
            finalX,
            finalY,
            iw,
            ih,
            boxOthers.x,
            boxOthers.y,
            boxOthers.w,
            boxOthers.h,
          )
        ) {
          patchItem(imageId, { groupId: undefined });
        }
      }, 0);
    },
    [patchItem],
  );

  const onOpenGroup = useCallback(
    (groupId: string) => {
      const g = groups.find((x) => x.id === groupId);
      if (!g) return;
      const byId = new Map(items.map((i) => [i.id, i]));
      const members = g.memberImageIds
        .map((id) => byId.get(id))
        .filter((i) => isGroupMemberItem(i));
      const { layout, positions } = buildExpandedGridLayout(
        members,
        g.collapseCenterX,
        g.collapseCenterY,
      );
      for (const mid of g.memberImageIds) {
        const p = positions.get(mid);
        if (p) patchItem(mid, { x: p.x, y: p.y });
      }
      patchGroup(groupId, {
        expandedPinned: true,
        expandedGrid: layout,
      });
    },
    [groups, items, patchGroup, patchItem],
  );

  const onGoToGroupFromRail = useCallback(
    (g: CanvasGroup) => {
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const z = viewport.zoom;
      setPan(
        rect.width / 2 - g.collapseCenterX * z,
        rect.height / 2 - g.collapseCenterY * z,
      );
      onOpenGroup(g.id);
    },
    [onOpenGroup, setPan, viewport.zoom],
  );

  useEffect(() => {
    registerFocusGroupHandler((groupId: string) => {
      const g = groups.find((x) => x.id === groupId);
      if (!g) return;
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const z = viewport.zoom;
      setPan(
        rect.width / 2 - g.collapseCenterX * z,
        rect.height / 2 - g.collapseCenterY * z,
      );
      onOpenGroup(groupId);
    });
    return () => registerFocusGroupHandler(null);
  }, [
    groups,
    onOpenGroup,
    registerFocusGroupHandler,
    setPan,
    viewport.zoom,
  ]);

  const stackSeqRef = useRef(0);
  const prevSelectionKeyRef = useRef("");

  useEffect(() => {
    const key = [...selectedIds].sort().join(",");
    if (key.length === 0) {
      prevSelectionKeyRef.current = "";
      return;
    }
    if (key === prevSelectionKeyRef.current) return;
    prevSelectionKeyRef.current = key;

    const seq = ++stackSeqRef.current;
    const toBump = new Set<string>(selectedIds);

    for (const id of selectedIds) {
      const it = items.find((i) => i.id === id);
      if (
        (it?.type === "image" || it?.type === "pinterest") &&
        it.groupId
      ) {
        const g = groups.find((x) => x.id === it.groupId);
        g?.memberImageIds.forEach((mid) => toBump.add(mid));
      }
    }

    for (const t of items) {
      if (t.type !== "text") continue;
      if (t.attachedToImageId && toBump.has(t.attachedToImageId)) {
        toBump.add(t.id);
      }
      if (
        t.attachedToPinterestItemId &&
        selectedIds.includes(t.attachedToPinterestItemId)
      ) {
        toBump.add(t.id);
      }
    }

    for (const id of toBump) {
      patchItem(id, { stackPriority: seq });
    }
  }, [groups, items, patchItem, selectedIds]);

  const centerWorldPlacement = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const world = screenToWorld(rect.width / 2, rect.height / 2, viewport);
    return world;
  }, [viewport]);

  const addImageFromBlob = useCallback(
    async (
      blob: Blob,
      placement: Placement,
      feedback: "paste" | "upload" | "drop",
      options?: { skipToast?: boolean; pinterestPinUrl?: string },
    ): Promise<boolean> => {
      const url = createObjectUrl(blob);
      try {
        const natural = await loadImageNaturalSize(url);
        const { width, height } = computeInitialImageSize(
          natural.width,
          natural.height,
        );
        const el = viewportRef.current;
        if (!el) {
          revokeObjectUrl(url);
          return false;
        }
        const rect = el.getBoundingClientRect();
        let x = 0;
        let y = 0;
        if (placement.kind === "center") {
          const world = screenToWorld(
            rect.width / 2,
            rect.height / 2,
            viewport,
          );
          x = world.x - width / 2;
          y = world.y - height / 2;
        } else {
          const world = screenToWorld(
            placement.screenX,
            placement.screenY,
            viewport,
          );
          x = world.x;
          y = world.y;
        }
        const pin = options?.pinterestPinUrl?.trim();
        const item: ImageCanvasItem = {
          id: crypto.randomUUID(),
          type: "image",
          x,
          y,
          width,
          height,
          src: url,
          ...(pin ? { pinterestPinUrl: pin } : {}),
        };
        addItem(item);
        if (!options?.skipToast) {
          const label =
            feedback === "paste"
              ? "Image pasted"
              : feedback === "upload"
                ? "Image uploaded"
                : "Image placed";
          toast.success(label);
        }
        return true;
      } catch {
        revokeObjectUrl(url);
        if (!options?.skipToast) {
          toast.error("Could not load that image");
        }
        return false;
      }
    },
    [addItem, viewport],
  );

  const addImageFromBlobAtWorld = useCallback(
    async (
      blob: Blob,
      wx: number,
      wy: number,
      options?: { pinterestPinUrl?: string; groupId?: string },
    ): Promise<{ width: number; height: number; id: string } | null> => {
      const url = createObjectUrl(blob);
      try {
        const natural = await loadImageNaturalSize(url);
        const { width, height } = computeInitialImageSize(
          natural.width,
          natural.height,
        );
        const id = crypto.randomUUID();
        const item: ImageCanvasItem = {
          id,
          type: "image",
          x: wx,
          y: wy,
          width,
          height,
          src: url,
          ...(options?.pinterestPinUrl
            ? { pinterestPinUrl: options.pinterestPinUrl }
            : {}),
          ...(options?.groupId ? { groupId: options.groupId } : {}),
        };
        addItem(item);
        return { width, height, id };
      } catch {
        revokeObjectUrl(url);
        return null;
      }
    },
    [addItem],
  );

  const addTikTokFromUrl = useCallback(
    async (canonicalUrl: string) => {
      const world = centerWorldPlacement();
      const id = crypto.randomUUID();
      const w = DEFAULT_TIKTOK_NODE_WIDTH;
      const h = DEFAULT_TIKTOK_NODE_HEIGHT;

      const item: TikTokCanvasItem = {
        id,
        type: "tiktok",
        url: canonicalUrl,
        x: world.x - w / 2,
        y: world.y - h / 2,
        width: w,
        height: h,
        title: "Loading…",
        thumbnailUrl: null,
        authorName: null,
        previewStatus: "loading",
      };
      addItem(item);
      toast.success("TikTok URL added");

      try {
        const preview = await fetchTikTokPreview(canonicalUrl);
        patchItem(id, {
          title: preview.title,
          thumbnailUrl: preview.thumbnailUrl,
          authorName: preview.authorName,
          previewStatus: "ready",
          previewError: undefined,
        });
        if (preview.previewLimited) {
          toast.message("TikTok preview limited", {
            description:
              "Thumbnail/title may be unavailable for this post type; the link is still on the canvas.",
          });
        } else {
          toast.success("TikTok preview loaded");
        }
      } catch {
        patchItem(id, {
          previewStatus: "error",
          previewError: "Preview unavailable",
          title: "TikTok",
        });
        toast.error("TikTok preview failed");
      }

      patchItem(id, { analysisStatus: "loading", analysisError: undefined });
      try {
        const res = await fetch("/api/tiktok/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: canonicalUrl }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          contextText?: string;
        };
        if (!res.ok) {
          patchItem(id, {
            analysisStatus: "error",
            analysisError:
              typeof data.error === "string"
                ? data.error
                : "Context extraction failed",
          });
          return;
        }
        const contextText =
          typeof data.contextText === "string" ? data.contextText : "";
        patchItem(id, {
          analysisStatus: "ready",
          analysisContextText: contextText,
          analysisError: undefined,
        });
      } catch {
        patchItem(id, {
          analysisStatus: "error",
          analysisError: "Could not reach analysis service",
        });
      }
    },
    [addItem, centerWorldPlacement, patchItem],
  );

  const addPinterestFromUrl = useCallback(
    async (pinUrl: string) => {
      const world = centerWorldPlacement();
      const id = crypto.randomUUID();
      const w = DEFAULT_TIKTOK_NODE_WIDTH;
      const h = DEFAULT_TIKTOK_NODE_HEIGHT;

      const item: PinterestCanvasItem = {
        id,
        type: "pinterest",
        url: pinUrl,
        x: world.x - w / 2,
        y: world.y - h / 2,
        width: w,
        height: h,
        title: "Loading…",
        thumbnailUrl: null,
        authorName: null,
        previewStatus: "loading",
      };
      addItem(item);
      toast.success("Pinterest pin added");

      try {
        const preview = await fetchPinterestPreview(pinUrl);
        const meta: Parameters<typeof patchItem>[1] = {
          title: preview.title,
          thumbnailUrl: preview.thumbnailUrl,
          authorName: preview.authorName,
          previewStatus: "ready",
          previewError: undefined,
        };

        if (preview.thumbnailUrl) {
          try {
            const natural = await loadImageNaturalSize(preview.thumbnailUrl);
            const { width: nw, height: nh } = computePinterestThumbnailFrameSize(
              natural.width,
              natural.height,
            );
            const current = itemsRef.current.find((i) => i.id === id);
            if (current) {
              const cx = current.x + current.width / 2;
              const cy = current.y + current.height / 2;
              meta.x = cx - nw / 2;
              meta.y = cy - nh / 2;
            } else {
              meta.x = world.x - nw / 2;
              meta.y = world.y - nh / 2;
            }
            meta.width = nw;
            meta.height = nh;
          } catch {
            /* keep placeholder geometry if thumbnail dimensions fail */
          }
        }

        patchItem(id, meta);
        toast.success("Pinterest preview loaded");
      } catch {
        patchItem(id, {
          previewStatus: "error",
          previewError: "Preview unavailable",
          title: "Pinterest",
        });
        toast.error("Pinterest preview failed");
      }
    },
    [addItem, centerWorldPlacement, patchItem],
  );

  const addPinterestDownloadGroup = useCallback(
    async (opts: {
      query: string;
      count?: number;
      anchor: { x: number; y: number; width: number; height: number };
      pinUrlFallback?: string;
      groupLabel?: string;
      sourceImageItemId?: string;
      sourcePinterestItemId?: string;
      successToast: (placed: number) => string;
      requestError: string;
      httpError?: string;
      loadError: string;
    }) => {
      const count = Math.min(24, Math.max(1, opts.count ?? 12));
      const pinFallback = opts.pinUrlFallback?.trim() ?? "";
      try {
        const res = await fetch("/api/pinterest/similar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: opts.query, count }),
        });
        const data = (await res.json()) as {
          error?: string;
          images?: { url: string; pinUrl?: string }[];
        };
        if (!res.ok) {
          toast.error(data.error ?? opts.httpError ?? opts.requestError);
          return;
        }
        const list = data.images ?? [];
        if (list.length === 0) {
          toast.message("No images returned", {
            description:
              "Start the test_scripts API (uvicorn) and ensure gallery-dl can reach Pinterest.",
          });
          return;
        }
        const { anchor } = opts;
        const stackCx = anchor.x + anchor.width / 2;
        const stackCy = anchor.y + anchor.height / 2 + 40;
        const groupLabel = opts.groupLabel?.trim() || "group";

        const anchorItemId =
          opts.sourceImageItemId ?? opts.sourcePinterestItemId;
        const existingGid = anchorItemId
          ? resolveExistingGroupIdForMember(
              itemsRef.current,
              groupsRef.current,
              anchorItemId,
            )
          : undefined;
        const reuseGroup =
          Boolean(existingGid) &&
          groupsRef.current.some((g) => g.id === existingGid);

        let groupId: string;
        if (reuseGroup && existingGid) {
          groupId = existingGid;
        } else {
          groupId = crypto.randomUUID();
          addGroup({
            id: groupId,
            collapseCenterX: stackCx,
            collapseCenterY: stackCy,
            label: groupLabel,
            expandedPinned: false,
            memberImageIds: [],
          });

          if (opts.sourceImageItemId) {
            const src = itemsRef.current.find(
              (i): i is ImageCanvasItem =>
                i.id === opts.sourceImageItemId && i.type === "image",
            );
            if (src) {
              patchItem(src.id, { groupId });
            }
          } else if (opts.sourcePinterestItemId) {
            const pinNode = itemsRef.current.find(
              (i): i is PinterestCanvasItem =>
                i.id === opts.sourcePinterestItemId && i.type === "pinterest",
            );
            if (pinNode?.thumbnailUrl) {
              try {
                const proxied = `/api/pinterest/image-proxy?url=${encodeURIComponent(
                  pinNode.thumbnailUrl,
                )}`;
                const tr = await fetch(proxied);
                if (tr.ok) {
                  const blob = await tr.blob();
                  await addImageFromBlobAtWorld(blob, anchor.x, anchor.y, {
                    groupId,
                    pinterestPinUrl: pinNode.url,
                  });
                }
              } catch {
                /* proxy or decode failed; group still gets similars */
              }
            }
          }
        }

        let x = anchor.x;
        const y = anchor.y + anchor.height + 20;
        const gap = 12;
        let placed = 0;
        for (const img of list) {
          const ir = await fetch(img.url);
          if (!ir.ok) continue;
          const blob = await ir.blob();
          const pinForAsset = (img.pinUrl?.trim() || pinFallback).trim();
          const dims = await addImageFromBlobAtWorld(
            blob,
            x,
            y,
            {
              ...(pinForAsset ? { pinterestPinUrl: pinForAsset } : {}),
              groupId,
            },
          );
          if (dims) {
            placed += 1;
            x += dims.width + gap;
          }
        }
        if (placed === 0) {
          toast.error(opts.loadError);
          return;
        }
        toast.success(opts.successToast(placed));
      } catch {
        toast.error(opts.requestError);
      }
    },
    [addGroup, addImageFromBlobAtWorld, patchItem],
  );

  const onPinterestSimilar = useCallback(
    async ({
      pinUrl,
      anchor,
      sourceImageItemId,
      sourcePinterestItemId,
    }: PinterestSimilarRequest) => {
      await addPinterestDownloadGroup({
        query: pinUrl,
        count: 12,
        anchor,
        pinUrlFallback: pinUrl,
        sourceImageItemId,
        sourcePinterestItemId,
        successToast: (placed) =>
          placed === 1
            ? "Added 1 similar image below"
            : `Added ${placed} similar images below`,
        requestError: "Similar pins request failed",
        httpError: "Could not fetch similar pins",
        loadError: "Could not load similar images",
      });
    },
    [addPinterestDownloadGroup],
  );

  const submitSimilarPinFromDialog = useCallback(() => {
    if (!similarPinForImageId) return;
    const pin = normalizePinterestUrl(similarPinUrlInput);
    if (!pin) {
      toast.error("Enter a valid Pinterest pin URL");
      return;
    }
    const img = items.find(
      (i): i is ImageCanvasItem =>
        i.id === similarPinForImageId && i.type === "image",
    );
    if (!img) {
      setSimilarPinForImageId(null);
      setSimilarPinUrlInput("");
      return;
    }
    const imageId = similarPinForImageId;
    setSimilarPinForImageId(null);
    setSimilarPinUrlInput("");
    void onPinterestSimilar({
      pinUrl: pin,
      sourceImageItemId: imageId,
      anchor: {
        x: img.x,
        y: img.y,
        width: img.width,
        height: img.height,
      },
    });
  }, [items, onPinterestSimilar, similarPinForImageId, similarPinUrlInput]);

  const onPasteImage = useCallback(
    (blob: Blob, meta?: { pinterestPinUrl?: string | null }) => {
      const pin = meta?.pinterestPinUrl?.trim();
      void addImageFromBlob(blob, { kind: "center" }, "paste", {
        pinterestPinUrl: pin || undefined,
      });
    },
    [addImageFromBlob],
  );

  const onPlainTextPaste = useCallback(
    (text: string) => {
      const canonical = normalizeTikTokUrl(text);
      if (canonical) {
        void addTikTokFromUrl(canonical);
        return;
      }
      const pinUrl = normalizePinterestUrl(text);
      if (pinUrl) {
        void addPinterestFromUrl(pinUrl);
        return;
      }
      if (looksLikeWebUrl(text)) {
        toast.message("Unsupported link", {
          description: "Paste a TikTok or Pinterest pin URL",
        });
      }
    },
    [addPinterestFromUrl, addTikTokFromUrl],
  );

  const onNonImagePaste = useCallback(() => {
    toast.message("No image in clipboard");
  }, []);

  useCanvasPaste({
    onImageBlob: onPasteImage,
    onPlainText: onPlainTextPaste,
    onNonImagePaste: onNonImagePaste,
  });

  const onFileFromInput = useCallback(
    (file: File) => {
      void addImageFromBlob(file, { kind: "center" }, "upload");
    },
    [addImageFromBlob],
  );

  const onInvalidFile = useCallback(() => {
    toast.error("Please choose a valid image file");
  }, []);

  const { inputRef, openFileDialog, onInputChange } = useCanvasFileInput({
    onFile: onFileFromInput,
    onInvalid: onInvalidFile,
  });

  const onDropFiles = useCallback(
    async (files: File[], screenX: number, screenY: number) => {
      let placed = 0;
      for (let i = 0; i < files.length; i++) {
        const ok = await addImageFromBlob(
          files[i],
          {
            kind: "point",
            screenX: screenX + i * 24,
            screenY: screenY + i * 24,
          },
          "drop",
          { skipToast: true },
        );
        if (ok) placed += 1;
      }
      if (placed === 1) toast.success("Image placed");
      else if (placed > 1) toast.success(`${placed} images placed`);
    },
    [addImageFromBlob],
  );

  const { isDraggingFileOver, dropHandlers } = useCanvasDrop({
    onFiles: onDropFiles,
  });

  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const el = viewportRef.current;
      if (!el) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return screenToWorld(
        clientX - rect.left,
        clientY - rect.top,
        viewport,
      );
    },
    [viewport],
  );

  /** Figma-style: drag on empty canvas = marquee; tiny movement = click to deselect; Shift+marquee = add */
  const onBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      marqueeStartRef.current = { sx, sy };
      setMarqueeBox({ x1: sx, y1: sy, x2: sx, y2: sy });

      const onMove = (ev: PointerEvent) => {
        const r = viewportRef.current?.getBoundingClientRect();
        const start = marqueeStartRef.current;
        if (!r || !start) return;
        const x = ev.clientX - r.left;
        const y = ev.clientY - r.top;
        setMarqueeBox({
          x1: start.sx,
          y1: start.sy,
          x2: x,
          y2: y,
        });
      };

      const onUp = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const start = marqueeStartRef.current;
        marqueeStartRef.current = null;
        setMarqueeBox(null);

        const r = viewportRef.current?.getBoundingClientRect();
        if (!r || !start) return;
        const endX = ev.clientX - r.left;
        const endY = ev.clientY - r.top;
        const dx = Math.abs(endX - start.sx);
        const dy = Math.abs(endY - start.sy);
        if (dx < 4 && dy < 4) {
          select(null);
          return;
        }

        const x1 = Math.min(start.sx, endX);
        const y1 = Math.min(start.sy, endY);
        const x2 = Math.max(start.sx, endX);
        const y2 = Math.max(start.sy, endY);

        const v = viewportStateRef.current;
        const w1 = screenToWorld(x1, y1, v);
        const w2 = screenToWorld(x2, y2, v);
        const wx1 = Math.min(w1.x, w2.x);
        const wy1 = Math.min(w1.y, w2.y);
        const wx2 = Math.max(w1.x, w2.x);
        const wy2 = Math.max(w1.y, w2.y);
        const rw = wx2 - wx1;
        const rh = wy2 - wy1;

        const hit = itemsRef.current.filter((item) =>
          itemIntersectsWorldRect(item, wx1, wy1, rw, rh),
        );
        const ids = hit.map((it) => it.id);
        if (ev.shiftKey) {
          selectMany(ids, { additive: true });
        } else {
          selectMany(ids);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [select, selectMany],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const onDeleteSelected = useCallback(() => {
    if (selectedIds.length === 0) return;
    removeItems([...selectedIds]);
    toast.message(
      selectedIds.length === 1
        ? "Removed from canvas"
        : `${selectedIds.length} items removed`,
    );
  }, [removeItems, selectedIds]);

  useEffect(() => {
    const isEditableTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el?.closest) return false;
      return Boolean(
        el.closest(
          "input, textarea, select, [contenteditable='true'], [contenteditable='']",
        ),
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIds.length > 0) {
          e.preventDefault();
          onDeleteSelected();
        }
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "y" || e.key === "Y") {
        if (!e.shiftKey) {
          e.preventDefault();
          redo();
        }
        return;
      }

      if (e.key.toLowerCase() !== "z") return;

      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDeleteSelected, redo, selectedIds, undo]);

  const onTikTokModalSubmit = useCallback(
    (raw: string) => {
      const canonical = normalizeTikTokUrl(raw);
      if (!canonical) {
        toast.error("Not a valid TikTok URL");
        return;
      }
      void addTikTokFromUrl(canonical);
      setTiktokDialogOpen(false);
    },
    [addTikTokFromUrl],
  );

  const onPinterestModalSubmit = useCallback(
    (raw: string) => {
      const canonical = normalizePinterestUrl(raw);
      if (!canonical) {
        toast.error("Not a valid Pinterest pin URL");
        return;
      }
      void addPinterestFromUrl(canonical);
      setPinterestDialogOpen(false);
    },
    [addPinterestFromUrl],
  );

  const onPinterestSearchModalSubmit = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      setPinterestSearchDialogOpen(false);
      const world = centerWorldPlacement();
      const w = DEFAULT_TIKTOK_NODE_WIDTH;
      const h = DEFAULT_TIKTOK_NODE_HEIGHT;
      const anchor = {
        x: world.x - w / 2,
        y: world.y - h / 2,
        width: w,
        height: h,
      };
      const groupLabel = q.length > 36 ? `${q.slice(0, 33)}…` : q;
      void addPinterestDownloadGroup({
        query: q,
        count: 16,
        anchor,
        groupLabel,
        successToast: (placed) =>
          placed === 1
            ? "Added 1 pin from search"
            : `Added ${placed} pins from search`,
        requestError: "Pinterest search failed",
        loadError: "Could not load search results",
      });
    },
    [addPinterestDownloadGroup, centerWorldPlacement],
  );

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={onInputChange}
      />
      <div
        className="relative min-h-0 flex-1"
        {...dropHandlers}
      >
        <CanvasViewport
          ref={viewportRef}
          viewport={viewport}
          onPanBy={panBy}
          onZoomAtPoint={zoomAtPoint}
          onBackgroundPointerDown={onBackgroundPointerDown}
          className="h-full min-h-0"
        >
          <CanvasItemsLayer
            items={items}
            groups={groups}
            viewport={viewport}
            viewportPx={viewportPx}
            hoverPreviewGroupId={hoverPreviewGroupId}
            selectedIds={selectedIds}
            toWorld={toWorld}
            onSelectItem={(id, additive) => select(id, { additive })}
            onUpdateItem={patchItem}
            onPinterestSimilar={onPinterestSimilar}
            onPatchGroup={patchGroup}
            onMergeDrop={onMergeDrop}
            onOpenGroup={onOpenGroup}
            onImageDragWorldMove={onImageDragWorldMove}
            onImageDragWorldStart={onImageDragWorldStart}
            onImageDragWorldEnd={onImageDragWorldEnd}
            onGroupMemberDragEnd={onGroupMemberDragEnd}
            activeFreeDragImageIds={activeFreeDragImageIds}
            onOpenImageTextEditor={(id) =>
              setTextEditTarget({ kind: "image", id })
            }
            onOpenPinterestTextEditor={(id) =>
              setTextEditTarget({ kind: "pinterest", id })
            }
            onImageMultiDragStart={onImageMultiDragStart}
            onRequestSimilarPinUrl={onRequestSimilarPinUrl}
          />
          <CanvasGroupMergeHighlight
            groupId={mergeHoverGroupId}
            items={items}
            groups={groups}
            layoutMap={layoutMapNoHover}
            viewportZoom={viewport.zoom}
          />
          <CanvasPairGroupHighlight
            targetImageId={pairGroupHighlightImageId}
            items={items}
            layoutMap={layoutMapNoHover}
            viewportZoom={viewport.zoom}
          />
          <CanvasGroupOverlays
            items={items}
            groups={groups}
            layoutMap={overlayLayoutMap}
            onPatchGroup={patchGroup}
            viewportZoom={viewport.zoom}
          />
        </CanvasViewport>
        {marqueeBox ? (
          <div
            className="pointer-events-none absolute inset-0 z-[25]"
            aria-hidden
          >
            <div
              className="absolute border border-primary bg-primary/15"
              style={{
                left: Math.min(marqueeBox.x1, marqueeBox.x2),
                top: Math.min(marqueeBox.y1, marqueeBox.y2),
                width: Math.abs(marqueeBox.x2 - marqueeBox.x1),
                height: Math.abs(marqueeBox.y2 - marqueeBox.y1),
              }}
            />
          </div>
        ) : null}
        <CanvasDropOverlay visible={isDraggingFileOver} />
      </div>

      <CanvasGroupNavigator
        items={items}
        groups={groups}
        onGoToGroup={onGoToGroupFromRail}
      />

      <CanvasToolbar
        onUploadClick={openFileDialog}
        onAddTikTokClick={() => setTiktokDialogOpen(true)}
        onAddPinterestSearchClick={() => setPinterestSearchDialogOpen(true)}
        onAddPinterestPinUrlClick={() => setPinterestDialogOpen(true)}
        onResetView={resetView}
        onDeleteSelected={onDeleteSelected}
        hasSelection={selectedIds.length > 0}
        onUndo={undo}
        onRedo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
      />
      <p
        className="pointer-events-none absolute bottom-16 left-1/2 z-20 max-w-[min(100%,28rem)] -translate-x-1/2 px-2 text-center text-[10px] text-muted-foreground"
        suppressHydrationWarning
      >
        Delete/Backspace removes selection · ⌘/Ctrl+Z undo · Shift+⌘/Ctrl+Z redo ·
        Hover a stack for a slight fan · Click stack to expand ·
        ✕ on outline to close · Hold over another ungrouped image ~0.5s, then
        release to create a group · Captions: pencil on selected image or
        Pinterest pin
      </p>

      <TikTokUrlDialog
        open={tiktokDialogOpen}
        onOpenChange={setTiktokDialogOpen}
        onSubmitUrl={onTikTokModalSubmit}
      />

      <PinterestUrlDialog
        open={pinterestDialogOpen}
        onOpenChange={setPinterestDialogOpen}
        onSubmitUrl={onPinterestModalSubmit}
      />

      <PinterestSearchDialog
        open={pinterestSearchDialogOpen}
        onOpenChange={setPinterestSearchDialogOpen}
        onSubmitSearch={onPinterestSearchModalSubmit}
      />

      <Dialog
        open={similarPinForImageId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSimilarPinForImageId(null);
            setSimilarPinUrlInput("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Similar pins</DialogTitle>
            <DialogDescription>
              Paste a Pinterest pin URL to find similar pins. Your canvas image
              stays where it is; results are grouped from the pin you enter.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="https://www.pinterest.com/pin/… or pin.it/…"
            value={similarPinUrlInput}
            onChange={(e) => setSimilarPinUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitSimilarPinFromDialog();
            }}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSimilarPinForImageId(null);
                setSimilarPinUrlInput("");
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={submitSimilarPinFromDialog}>
              Find similar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {selectedIds.length > 0 ? (
        <p className="sr-only" aria-live="polite">
          {selectedIds.length === 1 ? "Item selected" : "Items selected"}
        </p>
      ) : null}

      {textEditSubjectResolved ? (
        <ImageTextEditorPanel
          key={`${textEditSubjectResolved.kind}-${textEditSubjectResolved.item.id}`}
          subject={textEditSubjectResolved}
          items={items}
          onClose={() => setTextEditTarget(null)}
          onUpdateItem={patchItem}
          onAddItem={addItem}
          onRemoveItem={removeItem}
        />
      ) : null}
    </div>
  );
}
