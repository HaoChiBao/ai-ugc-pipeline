"use client";

import { useCallback, useReducer, useRef, useEffect } from "react";
import type { CanvasItem, CanvasItemPatch } from "@/lib/canvas/types";
import { revokeObjectUrl } from "@/lib/canvas/files";

type CanvasDocState = {
  items: CanvasItem[];
  selectedId: string | null;
};

type Action =
  | { type: "ADD_ITEM"; item: CanvasItem }
  | { type: "REMOVE_ITEM"; id: string }
  | { type: "CLEAR_ALL" }
  | { type: "PATCH_ITEM"; id: string; patch: CanvasItemPatch }
  | { type: "SELECT"; id: string | null };

function reducer(state: CanvasDocState, action: Action): CanvasDocState {
  switch (action.type) {
    case "ADD_ITEM":
      return {
        ...state,
        items: [...state.items, action.item],
        selectedId: action.item.id,
      };
    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((i) => i.id !== action.id),
        selectedId:
          state.selectedId === action.id ? null : state.selectedId,
      };
    case "CLEAR_ALL":
      return { items: [], selectedId: null };
    case "PATCH_ITEM":
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === action.id ? ({ ...i, ...action.patch } as CanvasItem) : i,
        ),
      };
    case "SELECT":
      return { ...state, selectedId: action.id };
    default:
      return state;
  }
}

const initialDoc: CanvasDocState = {
  items: [],
  selectedId: null,
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

  const select = useCallback((id: string | null) => {
    dispatch({ type: "SELECT", id });
  }, []);

  const removeItem = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (item?.type === "image") {
      revokeObjectUrl(item.src);
    }
    dispatch({ type: "REMOVE_ITEM", id });
  }, []);

  const clearAll = useCallback(() => {
    for (const item of itemsRef.current) {
      if (item.type === "image") {
        revokeObjectUrl(item.src);
      }
    }
    dispatch({ type: "CLEAR_ALL" });
  }, []);

  return {
    items: state.items,
    selectedId: state.selectedId,
    addItem,
    removeItem,
    patchItem,
    select,
    clearAll,
    dispatch,
  };
}
