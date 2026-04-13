"use client";

import { useCallback, useReducer, useRef, useEffect } from "react";
import type { CanvasItem, CanvasItemPatch } from "@/lib/canvas/types";
import { revokeObjectUrl } from "@/lib/canvas/files";

type CanvasDocState = {
  items: CanvasItem[];
  selectedIds: string[];
};

type Action =
  | { type: "ADD_ITEM"; item: CanvasItem }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "REMOVE_ITEMS"; ids: string[] }
  | { type: "CLEAR_ALL" }
  | { type: "PATCH_ITEM"; id: string; patch: CanvasItemPatch }
  | { type: "SELECT"; id: string | null; additive?: boolean }
  | { type: "SELECT_MANY"; ids: string[]; additive?: boolean };

function reducer(state: CanvasDocState, action: Action): CanvasDocState {
  switch (action.type) {
    case "ADD_ITEM":
      return {
        ...state,
        items: [...state.items, action.item],
        selectedIds: [action.item.id],
      };
    case "REMOVE_ITEM": {
      const item = state.items.find((i) => i.id === action.id);
      if (item?.type === "image") {
        revokeObjectUrl(item.src);
      }
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        selectedIds: state.selectedIds.filter((id) => id !== action.id),
      };
    }
    case "REMOVE_ITEMS": {
      const removeSet = new Set(action.ids);
      for (const i of state.items) {
        if (removeSet.has(i.id) && i.type === "image") {
          revokeObjectUrl(i.src);
        }
      }
      return {
        ...state,
        items: state.items.filter((i) => !removeSet.has(i.id)),
        selectedIds: state.selectedIds.filter((id) => !removeSet.has(id)),
      };
    }
    case "CLEAR_ALL":
      for (const i of state.items) {
        if (i.type === "image") {
          revokeObjectUrl(i.src);
        }
      }
      return { items: [], selectedIds: [] };
    case "PATCH_ITEM":
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? ({ ...i, ...action.patch } as CanvasItem) : i,
        ),
      };
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
      // Figma-style: clicking an already-selected item in a multi-selection keeps the group
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
    default:
      return state;
  }
}

const initialDoc: CanvasDocState = {
  items: [],
  selectedIds: [],
};

export function useCanvasState() {
  const [state, dispatch] = useReducer(reducer, initialDoc);
  const itemsRef = useRef(state.items);
  useEffect(() => {
    itemsRef.current = state.items;
  }, [state.items]);

  const addItem = useCallback((item: CanvasItem) => {
    dispatch({ type: "ADD_ITEM", item });
  }, []);

  const patchItem = useCallback((id: string, patch: CanvasItemPatch) => {
    dispatch({ type: "PATCH_ITEM", id, patch });
  }, []);

  const select = useCallback(
    (id: string | null, options?: { additive?: boolean }) => {
      dispatch({ type: "SELECT", id, additive: options?.additive });
    },
    [],
  );

  const selectMany = useCallback(
    (ids: string[], options?: { additive?: boolean }) => {
      dispatch({ type: "SELECT_MANY", ids, additive: options?.additive });
    },
    [],
  );

  const removeItem = useCallback((id: string) => {
    dispatch({ type: "REMOVE_ITEM", id });
  }, []);

  const removeItems = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    dispatch({ type: "REMOVE_ITEMS", ids });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, []);

  return {
    items: state.items,
    selectedIds: state.selectedIds,
    addItem,
    removeItem,
    removeItems,
    patchItem,
    select,
    selectMany,
    clearAll,
    dispatch,
  };
}
