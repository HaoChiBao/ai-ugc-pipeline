"use client";

import {
  useCallback,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type {
  CanvasGroup,
  CanvasItem,
  CanvasItemPatch,
  ImageCanvasItem,
  PinterestCanvasItem,
} from "@/lib/canvas/types";
import { revokeObjectUrl } from "@/lib/canvas/files";

type CanvasDocState = {
  items: CanvasItem[];
  selectedIds: string[];
  groups: CanvasGroup[];
};

type Action =
  | { type: "ADD_ITEM"; item: CanvasItem }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "REMOVE_ITEMS"; ids: string[] }
  | { type: "CLEAR_ALL" }
  | { type: "PATCH_ITEM"; id: string; patch: CanvasItemPatch }
  | { type: "SELECT"; id: string | null; additive?: boolean }
  | { type: "SELECT_MANY"; ids: string[]; additive?: boolean }
  | { type: "ADD_GROUP"; group: CanvasGroup }
  | { type: "PATCH_GROUP"; id: string; patch: Partial<CanvasGroup> }
  | { type: "MERGE_IMAGE_ONTO_TARGET"; draggedId: string; targetId: string };

const MAX_HISTORY = 80;
/** Collapse rapid PATCH_ITEM (drag/resize) into one undo step */
const PATCH_HISTORY_GAP_MS = 450;

function cloneDoc(doc: CanvasDocState): CanvasDocState {
  return {
    items: doc.items.map((i) => ({ ...i } as CanvasItem)),
    selectedIds: [...doc.selectedIds],
    groups: doc.groups.map((g) => ({
      ...g,
      memberImageIds: [...g.memberImageIds],
      ...(g.expandedGrid
        ? { expandedGrid: { ...g.expandedGrid } }
        : {}),
    })),
  };
}

function revokeOrphans(current: CanvasItem[], next: CanvasItem[]) {
  const nextIds = new Set(next.map((i) => i.id));
  for (const i of current) {
    if (!nextIds.has(i.id) && i.type === "image") {
      revokeObjectUrl(i.src);
    }
  }
}

type MergeVisualItem = ImageCanvasItem | PinterestCanvasItem;

function isMergeVisualItem(
  i: CanvasItem | undefined,
): i is MergeVisualItem {
  return Boolean(i && (i.type === "image" || i.type === "pinterest"));
}

function mergeImageOntoTarget(
  state: CanvasDocState,
  draggedId: string,
  targetId: string,
): CanvasDocState {
  if (draggedId === targetId) return state;
  const dragged = state.items.find(
    (i): i is MergeVisualItem =>
      i.id === draggedId && isMergeVisualItem(i),
  );
  const target = state.items.find(
    (i): i is MergeVisualItem =>
      i.id === targetId && isMergeVisualItem(i),
  );
  if (!dragged || !target) return state;

  let groups = state.groups
    .map((g) => ({
      ...g,
      memberImageIds: g.memberImageIds.filter((id) => id !== draggedId),
    }))
    .filter((g) => g.memberImageIds.length > 0);

  if (target.groupId) {
    const gid = target.groupId;
    let g = groups.find((x) => x.id === gid);
    if (!g) {
      g = {
        id: gid,
        collapseCenterX: target.x + target.width / 2,
        collapseCenterY: target.y + target.height / 2,
        label: "group",
        expandedPinned: false,
        memberImageIds: [targetId],
      };
      groups = [...groups, g];
    }
    const nextMembers = g.memberImageIds.includes(draggedId)
      ? g.memberImageIds
      : [...g.memberImageIds, draggedId];
    groups = groups.map((x) =>
      x.id === gid ? { ...x, memberImageIds: nextMembers } : x,
    );
    const items = state.items.map((i) =>
      i.id === draggedId && isMergeVisualItem(i)
        ? { ...i, groupId: gid }
        : i,
    );
    return { ...state, items, groups };
  }

  const newGid = crypto.randomUUID();
  const cx =
    (target.x + target.width / 2 + dragged.x + dragged.width / 2) / 2;
  const cy =
    (target.y + target.height / 2 + dragged.y + dragged.height / 2) / 2;
  groups.push({
    id: newGid,
    collapseCenterX: cx,
    collapseCenterY: cy,
    label: "group",
    expandedPinned: false,
    memberImageIds: [targetId, draggedId],
  });
  const items = state.items.map((i) =>
    (i.id === draggedId || i.id === targetId) && isMergeVisualItem(i)
      ? { ...i, groupId: newGid }
      : i,
  );
  return { ...state, items, groups };
}

function reduceCanvasDoc(state: CanvasDocState, action: Action): CanvasDocState {
  switch (action.type) {
    case "ADD_ITEM": {
      const nextItems = [...state.items, action.item];
      let nextGroups = state.groups;
      if (
        (action.item.type === "image" || action.item.type === "pinterest") &&
        action.item.groupId
      ) {
        const gid = action.item.groupId;
        nextGroups = state.groups.map((g) =>
          g.id === gid
            ? {
                ...g,
                memberImageIds: g.memberImageIds.includes(action.item.id)
                  ? g.memberImageIds
                  : [...g.memberImageIds, action.item.id],
              }
            : g,
        );
      }
      return {
        ...state,
        items: nextItems,
        selectedIds: [action.item.id],
        groups: nextGroups,
      };
    }
    case "REMOVE_ITEM": {
      const item = state.items.find((i) => i.id === action.id);
      if (item?.type === "image") {
        revokeObjectUrl(item.src);
      }
      const nextGroups = state.groups
        .map((g) => ({
          ...g,
          memberImageIds: g.memberImageIds.filter((id) => id !== action.id),
        }))
        .filter((g) => g.memberImageIds.length > 0);
      return {
        ...state,
        items: state.items.filter((i) => {
          if (i.id === action.id) return false;
          if (
            i.type === "text" &&
            (i.attachedToImageId === action.id ||
              i.attachedToPinterestItemId === action.id)
          ) {
            return false;
          }
          return true;
        }),
        selectedIds: state.selectedIds.filter((id) => id !== action.id),
        groups: nextGroups,
      };
    }
    case "REMOVE_ITEMS": {
      const removeSet = new Set(action.ids);
      for (const i of state.items) {
        if (removeSet.has(i.id) && i.type === "image") {
          revokeObjectUrl(i.src);
        }
      }
      const nextGroups = state.groups
        .map((g) => ({
          ...g,
          memberImageIds: g.memberImageIds.filter((id) => !removeSet.has(id)),
        }))
        .filter((g) => g.memberImageIds.length > 0);
      return {
        ...state,
        items: state.items.filter((i) => {
          if (removeSet.has(i.id)) return false;
          if (i.type === "text") {
            if (
              i.attachedToImageId &&
              removeSet.has(i.attachedToImageId)
            ) {
              return false;
            }
            if (
              i.attachedToPinterestItemId &&
              removeSet.has(i.attachedToPinterestItemId)
            ) {
              return false;
            }
          }
          return true;
        }),
        selectedIds: state.selectedIds.filter((id) => !removeSet.has(id)),
        groups: nextGroups,
      };
    }
    case "CLEAR_ALL":
      for (const i of state.items) {
        if (i.type === "image") {
          revokeObjectUrl(i.src);
        }
      }
      return { items: [], selectedIds: [], groups: [] };
    case "PATCH_ITEM": {
      const prev = state.items.find((i) => i.id === action.id);
      const patch = action.patch;
      let nextGroups = state.groups;

      if (
        (prev?.type === "image" || prev?.type === "pinterest") &&
        Object.prototype.hasOwnProperty.call(patch, "groupId")
      ) {
        const newGid = patch.groupId;
        let ng = state.groups.map((g) => ({
          ...g,
          memberImageIds: g.memberImageIds.filter((id) => id !== action.id),
        }));
        ng = ng.filter(
          (g) => g.memberImageIds.length > 0 || (newGid && g.id === newGid),
        );
        if (newGid) {
          ng = ng.map((g) =>
            g.id === newGid
              ? {
                  ...g,
                  memberImageIds: g.memberImageIds.includes(action.id)
                    ? g.memberImageIds
                    : [...g.memberImageIds, action.id],
                }
              : g,
          );
        }
        nextGroups = ng;
      }

      const nextItems = state.items.map((i) =>
        i.id === action.id ? ({ ...i, ...patch } as CanvasItem) : i,
      );

      return { ...state, items: nextItems, groups: nextGroups };
    }
    case "SELECT":
      if (action.id === null) {
        return { ...state, selectedIds: [] };
      }
      if (action.additive) {
        const set = new Set(state.selectedIds);
        if (set.has(action.id)) set.delete(action.id);
        else set.add(action.id);
        return { ...state, selectedIds: [...set] };
      }
      if (
        state.selectedIds.length > 1 &&
        state.selectedIds.includes(action.id)
      ) {
        return state;
      }
      return { ...state, selectedIds: [action.id] };
    case "SELECT_MANY": {
      const unique = [...new Set(action.ids)];
      if (action.additive) {
        const set = new Set([...state.selectedIds, ...unique]);
        return { ...state, selectedIds: [...set] };
      }
      return { ...state, selectedIds: unique };
    }
    case "ADD_GROUP":
      return {
        ...state,
        groups: [...state.groups, action.group],
      };
    case "PATCH_GROUP": {
      const next = state.groups.map((g) =>
        g.id === action.id ? { ...g, ...action.patch } : g,
      );
      const updated = next.find((g) => g.id === action.id);
      const removePatched =
        updated !== undefined && updated.memberImageIds.length === 0;
      return {
        ...state,
        groups: removePatched
          ? next.filter((g) => g.id !== action.id)
          : next,
      };
    }
    case "MERGE_IMAGE_ONTO_TARGET":
      return mergeImageOntoTarget(
        state,
        action.draggedId,
        action.targetId,
      );
    default:
      return state;
  }
}

function shouldRecordHistoryAction(action: Action): boolean {
  return action.type !== "SELECT" && action.type !== "SELECT_MANY";
}

function flushHistoryAvailability(
  setAvail: (v: { canUndo: boolean; canRedo: boolean }) => void,
  pastRef: MutableRefObject<CanvasDocState[]>,
  futureRef: MutableRefObject<CanvasDocState[]>,
) {
  queueMicrotask(() => {
    setAvail({
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
    });
  });
}

export function useCanvasState() {
  const [state, setState] = useState<CanvasDocState>({
    items: [],
    selectedIds: [],
    groups: [],
  });

  const [historyAvail, setHistoryAvail] = useState({
    canUndo: false,
    canRedo: false,
  });

  const itemsRef = useRef(state.items);
  itemsRef.current = state.items;

  const pastRef = useRef<CanvasDocState[]>([]);
  const futureRef = useRef<CanvasDocState[]>([]);
  const patchGroupRef = useRef<{ id: string | null; t: number }>({
    id: null,
    t: 0,
  });

  const dispatch = useCallback((action: Action) => {
    setState((prev) => {
      if (shouldRecordHistoryAction(action)) {
        let pushSnapshot = true;
        if (action.type === "PATCH_ITEM") {
          const now = Date.now();
          const g = patchGroupRef.current;
          if (g.id === action.id && now - g.t < PATCH_HISTORY_GAP_MS) {
            pushSnapshot = false;
          }
          patchGroupRef.current = { id: action.id, t: now };
        } else {
          patchGroupRef.current = { id: null, t: 0 };
        }

        if (pushSnapshot) {
          pastRef.current.push(cloneDoc(prev));
          if (pastRef.current.length > MAX_HISTORY) {
            pastRef.current = pastRef.current.slice(-MAX_HISTORY);
          }
          futureRef.current = [];
        }
      }

      return reduceCanvasDoc(prev, action);
    });
    flushHistoryAvailability(setHistoryAvail, pastRef, futureRef);
  }, []);

  const undo = useCallback(() => {
    setState((current) => {
      if (pastRef.current.length === 0) return current;
      const prev = pastRef.current[pastRef.current.length - 1]!;
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current.unshift(cloneDoc(current));
      revokeOrphans(current.items, prev.items);
      patchGroupRef.current = { id: null, t: 0 };
      return cloneDoc(prev);
    });
    flushHistoryAvailability(setHistoryAvail, pastRef, futureRef);
  }, []);

  const redo = useCallback(() => {
    setState((current) => {
      if (futureRef.current.length === 0) return current;
      const next = futureRef.current.shift()!;
      pastRef.current.push(cloneDoc(current));
      revokeOrphans(current.items, next.items);
      patchGroupRef.current = { id: null, t: 0 };
      return cloneDoc(next);
    });
    flushHistoryAvailability(setHistoryAvail, pastRef, futureRef);
  }, []);

  const addItem = useCallback(
    (item: CanvasItem) => {
      dispatch({ type: "ADD_ITEM", item });
    },
    [dispatch],
  );

  const patchItem = useCallback(
    (id: string, patch: CanvasItemPatch) => {
      dispatch({ type: "PATCH_ITEM", id, patch });
    },
    [dispatch],
  );

  const select = useCallback(
    (id: string | null, options?: { additive?: boolean }) => {
      dispatch({ type: "SELECT", id, additive: options?.additive });
    },
    [dispatch],
  );

  const selectMany = useCallback(
    (ids: string[], options?: { additive?: boolean }) => {
      dispatch({ type: "SELECT_MANY", ids, additive: options?.additive });
    },
    [dispatch],
  );

  const removeItem = useCallback(
    (id: string) => {
      dispatch({ type: "REMOVE_ITEM", id });
    },
    [dispatch],
  );

  const removeItems = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      dispatch({ type: "REMOVE_ITEMS", ids });
    },
    [dispatch],
  );

  const clearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, [dispatch]);

  const addGroup = useCallback(
    (group: CanvasGroup) => {
      dispatch({ type: "ADD_GROUP", group });
    },
    [dispatch],
  );

  const patchGroup = useCallback(
    (id: string, patch: Partial<CanvasGroup>) => {
      dispatch({ type: "PATCH_GROUP", id, patch });
    },
    [dispatch],
  );

  const mergeImageOntoTarget = useCallback(
    (draggedId: string, targetId: string) => {
      dispatch({ type: "MERGE_IMAGE_ONTO_TARGET", draggedId, targetId });
    },
    [dispatch],
  );

  return {
    items: state.items,
    selectedIds: state.selectedIds,
    groups: state.groups,
    addItem,
    addGroup,
    removeItem,
    removeItems,
    patchItem,
    patchGroup,
    mergeImageOntoTarget,
    select,
    selectMany,
    clearAll,
    dispatch,
    undo,
    redo,
    canUndo: historyAvail.canUndo,
    canRedo: historyAvail.canRedo,
  };
}
