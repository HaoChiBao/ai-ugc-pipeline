import type {
  CanvasGroup,
  CanvasItem,
  GroupExpandedGridLayout,
  ImageCanvasItem,
  PinterestCanvasItem,
  TextCanvasItem,
  ViewportState,
} from "@/lib/canvas/types";

export type EffectiveItemLayout = {
  x: number;
  y: number;
  zIndex: number;
};

const STACK_DX = 5;
const STACK_DY = 6;
const GRID_GAP = 12;
/** Hover-only: blend stacked → expanded grid (0 = stack, 1 = full grid). */
const HOVER_PREVIEW_FAN = 0.26;
const Z_STACK_BASE = 80;
const Z_FLOW = 160;

function isImage(i: CanvasItem): i is ImageCanvasItem {
  return i.type === "image";
}

function isPinterest(i: CanvasItem): i is PinterestCanvasItem {
  return i.type === "pinterest";
}

function isText(i: CanvasItem): i is TextCanvasItem {
  return i.type === "text";
}

/** Items that can live in a stack / expanded grid group */
export type GroupMemberItem = ImageCanvasItem | PinterestCanvasItem;

export function isGroupMemberItem(
  i: CanvasItem | undefined,
): i is GroupMemberItem {
  return Boolean(i && (i.type === "image" || i.type === "pinterest"));
}

export function buildExpandedGridLayout(
  members: GroupMemberItem[],
  centerX: number,
  centerY: number,
): {
  layout: GroupExpandedGridLayout;
  positions: Map<string, EffectiveItemLayout>;
} {
  const positions = new Map<string, EffectiveItemLayout>();
  const n = members.length;
  if (n === 0) {
    return {
      layout: {
        memberCount: 0,
        side: 0,
        stride: 0,
        cellInner: 0,
        gridLeft: centerX,
        gridTop: centerY,
      },
      positions,
    };
  }

  const side = Math.ceil(Math.sqrt(n));
  const maxDim = members.reduce(
    (acc, m) => Math.max(acc, m.width, m.height),
    0,
  );
  const cellInner = Math.max(48, maxDim);
  const stride = cellInner + GRID_GAP;
  const span = side * stride - GRID_GAP;
  const gridLeft = centerX - span / 2;
  const gridTop = centerY - span / 2;

  const layout: GroupExpandedGridLayout = {
    memberCount: n,
    side,
    stride,
    cellInner,
    gridLeft,
    gridTop,
  };

  members.forEach((m, i) => {
    const col = i % side;
    const row = Math.floor(i / side);
    const cellLeft = gridLeft + col * stride;
    const cellTop = gridTop + row * stride;
    positions.set(m.id, {
      x: cellLeft + (cellInner - m.width) / 2,
      y: cellTop + (cellInner - m.height) / 2,
      zIndex: Z_FLOW + i,
    });
  });

  return { layout, positions };
}

/** Positions from a stored expanded grid + current member order (same count). */
export function layoutMapFromExpandedGrid(
  g: CanvasGroup,
  memberIds: string[],
  itemsById: Map<string, CanvasItem>,
): Map<string, EffectiveItemLayout> | null {
  const grid = g.expandedGrid;
  if (!grid || grid.memberCount !== memberIds.length || grid.side <= 0) {
    return null;
  }
  const out = new Map<string, EffectiveItemLayout>();
  memberIds.forEach((id, i) => {
    const m = itemsById.get(id);
    if (!m || !isGroupMemberItem(m)) return;
    const col = i % grid.side;
    const row = Math.floor(i / grid.side);
    const cellLeft = grid.gridLeft + col * grid.stride;
    const cellTop = grid.gridTop + row * grid.stride;
    out.set(id, {
      x: cellLeft + (grid.cellInner - m.width) / 2,
      y: cellTop + (grid.cellInner - m.height) / 2,
      zIndex: Z_FLOW + i,
    });
  });
  return out.size === memberIds.length ? out : null;
}

/**
 * World-space square grid centered on the group (preview / one-off layout).
 */
export function squareGridLayoutForMembers(
  members: GroupMemberItem[],
  centerX: number,
  centerY: number,
): Map<string, EffectiveItemLayout> {
  return buildExpandedGridLayout(members, centerX, centerY).positions;
}

/**
 * Effective positions for grouped images (stack vs expanded square grid) and
 * text captions attached to those images.
 */
export function computeGroupLayoutMap(
  items: CanvasItem[],
  groups: CanvasGroup[],
  _viewport: ViewportState,
  _viewportPx: { w: number; h: number } | null | undefined,
  hoverPreviewGroupId: string | null,
): Map<string, EffectiveItemLayout> {
  const map = new Map<string, EffectiveItemLayout>();
  const byId = new Map(items.map((i) => [i.id, i]));

  for (const g of groups) {
    const members = g.memberImageIds
      .map((id) => byId.get(id))
      .filter((i): i is GroupMemberItem => isGroupMemberItem(i));

    if (members.length === 0) continue;

    const collapsed = new Map<string, EffectiveItemLayout>();
    members.forEach((m, i) => {
      collapsed.set(m.id, {
        x: g.collapseCenterX - m.width / 2 + i * STACK_DX,
        y: g.collapseCenterY - m.height / 2 + i * STACK_DY,
        zIndex: Z_STACK_BASE + i,
      });
    });

    if (g.expandedPinned) {
      const gridPos = layoutMapFromExpandedGrid(
        g,
        g.memberImageIds,
        byId,
      );
      if (gridPos) {
        gridPos.forEach((v, k) => map.set(k, v));
      } else {
        squareGridLayoutForMembers(
          members,
          g.collapseCenterX,
          g.collapseCenterY,
        ).forEach((v, k) => map.set(k, v));
      }
      continue;
    }

    const preview =
      hoverPreviewGroupId === g.id && !g.expandedPinned;
    if (preview) {
      const expanded = squareGridLayoutForMembers(
        members,
        g.collapseCenterX,
        g.collapseCenterY,
      );
      const a = HOVER_PREVIEW_FAN;
      expanded.forEach((ev, id) => {
        const cv = collapsed.get(id);
        if (!cv) return;
        map.set(id, {
          x: cv.x + (ev.x - cv.x) * a,
          y: cv.y + (ev.y - cv.y) * a,
          zIndex: Math.round(Z_STACK_BASE + a * (Z_FLOW - Z_STACK_BASE)),
        });
      });
      continue;
    }

    collapsed.forEach((v, k) => map.set(k, v));
  }

  for (const item of items) {
    if (!isText(item) || !item.attachedToImageId) continue;
    const img = byId.get(item.attachedToImageId);
    if (!img || !isImage(img)) continue;

    const imgLayout = map.get(img.id);
    const ix = imgLayout?.x ?? img.x;
    const iy = imgLayout?.y ?? img.y;
    const iz = (imgLayout?.zIndex ?? 40) + 40;

    const fx = Math.min(
      0.92,
      Math.max(0.08, item.overlayFractionX ?? 0.5),
    );
    const fy = Math.min(
      0.92,
      Math.max(0.08, item.overlayFractionY ?? 0.42),
    );
    const cx = ix + img.width * fx - item.width / 2;
    const cy = iy + img.height * fy - item.height / 2;

    map.set(item.id, {
      x: cx,
      y: cy,
      zIndex: iz,
    });
  }

  for (const item of items) {
    if (!isText(item) || !item.attachedToPinterestItemId) continue;
    const pin = byId.get(item.attachedToPinterestItemId);
    if (!pin || !isPinterest(pin)) continue;

    const pinLayout = map.get(pin.id);
    const px = pinLayout?.x ?? pin.x;
    const py = pinLayout?.y ?? pin.y;
    const pz = (pinLayout?.zIndex ?? 40) + 40;

    const fx = Math.min(
      0.92,
      Math.max(0.08, item.overlayFractionX ?? 0.5),
    );
    const fy = Math.min(
      0.92,
      Math.max(0.08, item.overlayFractionY ?? 0.42),
    );
    const cx = px + pin.width * fx - item.width / 2;
    const cy = py + pin.height * fy - item.height / 2;

    map.set(item.id, {
      x: cx,
      y: cy,
      zIndex: pz,
    });
  }

  return map;
}

export function groupExpanded(g: CanvasGroup): boolean {
  return g.expandedPinned;
}

/** Axis-aligned overlap in world space. */
export function worldAabbOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/** Bounding box of the given member image ids (world coords). */
export function groupImageBoundsForMemberIds(
  items: CanvasItem[],
  memberIds: string[],
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const mid of memberIds) {
    const im = items.find(
      (i): i is GroupMemberItem =>
        i.id === mid && isGroupMemberItem(i),
    );
    if (!im) continue;
    minX = Math.min(minX, im.x);
    minY = Math.min(minY, im.y);
    maxX = Math.max(maxX, im.x + im.width);
    maxY = Math.max(maxY, im.y + im.height);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function groupBoundsFromLayout(
  items: CanvasItem[],
  g: CanvasGroup,
  layout: Map<string, EffectiveItemLayout>,
): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const consider = (id: string, w: number, h: number) => {
    const L = layout.get(id);
    const it = items.find((i) => i.id === id);
    const x = L?.x ?? it?.x;
    const y = L?.y ?? it?.y;
    if (x === undefined || y === undefined) return;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };

  for (const mid of g.memberImageIds) {
    const im = items.find(
      (i): i is GroupMemberItem =>
        i.id === mid && isGroupMemberItem(i),
    );
    if (!im) continue;
    consider(im.id, im.width, im.height);
  }

  for (const t of items) {
    if (t.type !== "text") continue;
    const attachId = t.attachedToImageId ?? t.attachedToPinterestItemId;
    if (!attachId || !g.memberImageIds.includes(attachId)) continue;
    consider(t.id, t.width, t.height);
  }

  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function collapsedStackHit(
  g: CanvasGroup,
  wx: number,
  wy: number,
  items: CanvasItem[],
  layout: Map<string, EffectiveItemLayout>,
  pad = 8,
): boolean {
  const members = g.memberImageIds
    .map((id) => items.find((i) => i.id === id && isGroupMemberItem(i)))
    .filter(Boolean) as GroupMemberItem[];
  if (members.length === 0) return false;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const m of members) {
    const L = layout.get(m.id);
    const x = L?.x ?? m.x;
    const y = L?.y ?? m.y;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + m.width);
    maxY = Math.max(maxY, y + m.height);
  }
  return (
    wx >= minX - pad &&
    wx <= maxX + pad &&
    wy >= minY - pad &&
    wy <= maxY + pad
  );
}

/** Group under the pointer for merge (expanded bounds or collapsed stack). */
/** Topmost image whose bounds contain (wx, wy), excluding `excludeId`. */
export function findTopImageUnderWorldPoint(
  items: CanvasItem[],
  layoutMap: Map<string, EffectiveItemLayout>,
  excludeId: string,
  wx: number,
  wy: number,
): GroupMemberItem | null {
  const candidates = items.filter(
    (i): i is GroupMemberItem =>
      isGroupMemberItem(i) && i.id !== excludeId,
  );
  candidates.sort(
    (a, b) =>
      (layoutMap.get(b.id)?.zIndex ?? 0) - (layoutMap.get(a.id)?.zIndex ?? 0),
  );
  for (const c of candidates) {
    const L = layoutMap.get(c.id);
    const x = L?.x ?? c.x;
    const y = L?.y ?? c.y;
    if (wx >= x && wx <= x + c.width && wy >= y && wy <= y + c.height) {
      return c;
    }
  }
  return null;
}

export function findMergeTargetGroupId(
  draggedId: string,
  wx: number,
  wy: number,
  items: CanvasItem[],
  groups: CanvasGroup[],
  viewport: ViewportState,
  viewportPx: { w: number; h: number } | null | undefined,
): string | null {
  const pxW = Math.max(1, viewportPx?.w ?? 800);
  const map = computeGroupLayoutMap(
    items,
    groups,
    viewport,
    { w: pxW, h: viewportPx?.h ?? 600 },
    null,
  );
  for (const g of [...groups].reverse()) {
    if (g.memberImageIds.includes(draggedId)) {
      continue;
    }
    if (g.expandedPinned) {
      const box = groupBoundsFromLayout(items, g, map);
      if (
        box &&
        wx >= box.x &&
        wx <= box.x + box.w &&
        wy >= box.y &&
        wy <= box.y + box.h
      ) {
        return g.id;
      }
    } else if (collapsedStackHit(g, wx, wy, items, map)) {
      return g.id;
    }
  }
  return null;
}

/**
 * Resolves which canvas group an image/pinterest item belongs to. Prefer
 * `item.groupId` when that group still exists; otherwise fall back to any group
 * whose `memberImageIds` contains the item (covers rare inconsistencies).
 */
export function resolveExistingGroupIdForMember(
  items: CanvasItem[],
  groups: CanvasGroup[],
  itemId: string,
): string | undefined {
  const item = items.find((i) => i.id === itemId);
  const fromItem =
    item && isGroupMemberItem(item) && item.groupId ? item.groupId : undefined;
  if (fromItem && groups.some((g) => g.id === fromItem)) {
    return fromItem;
  }
  const host = groups.find((g) => g.memberImageIds.includes(itemId));
  return host?.id;
}
