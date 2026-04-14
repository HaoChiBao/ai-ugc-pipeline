"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCanvasState } from "@/hooks/canvas/useCanvasState";
import { useCanvasViewport } from "@/hooks/canvas/useCanvasViewport";

type CanvasWorkspaceValue = ReturnType<typeof useCanvasState> &
  ReturnType<typeof useCanvasViewport> & {
    projectId: string | null;
    setProjectId: (id: string | null) => void;
    /** World coordinates at the center of the canvas viewport (updated by InfiniteCanvas). */
    getCanvasViewportCenterWorld: () => { x: number; y: number };
    setCanvasViewportCenterWorldGetter: (
      fn: () => { x: number; y: number },
    ) => void;
    /** Pan to group and expand; no-op until InfiniteCanvas registers the handler. */
    focusGroupOnCanvas: (groupId: string) => void;
    /** Internal: InfiniteCanvas registers implementation. */
    registerFocusGroupHandler: (fn: ((groupId: string) => void) | null) => void;
  };

const CanvasWorkspaceContext = createContext<CanvasWorkspaceValue | null>(null);

export function CanvasWorkspaceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const canvas = useCanvasState();
  const viewport = useCanvasViewport();
  const [projectId, setProjectId] = useState<string | null>(null);
  const viewportCenterWorldRef = useRef<() => { x: number; y: number }>(() => ({
    x: 0,
    y: 0,
  }));
  const focusGroupHandlerRef = useRef<((groupId: string) => void) | null>(null);

  const setProjectIdStable = useCallback((id: string | null) => {
    setProjectId(id);
  }, []);

  const setCanvasViewportCenterWorldGetter = useCallback(
    (fn: () => { x: number; y: number }) => {
      viewportCenterWorldRef.current = fn;
    },
    [],
  );

  const getCanvasViewportCenterWorld = useCallback(
    () => viewportCenterWorldRef.current(),
    [],
  );

  const registerFocusGroupHandler = useCallback(
    (fn: ((groupId: string) => void) | null) => {
      focusGroupHandlerRef.current = fn;
    },
    [],
  );

  const focusGroupOnCanvas = useCallback((groupId: string) => {
    focusGroupHandlerRef.current?.(groupId);
  }, []);

  const value = useMemo(
    () => ({
      ...canvas,
      ...viewport,
      projectId,
      setProjectId: setProjectIdStable,
      getCanvasViewportCenterWorld,
      setCanvasViewportCenterWorldGetter,
      focusGroupOnCanvas,
      registerFocusGroupHandler,
    }),
    [
      canvas,
      viewport,
      projectId,
      setProjectIdStable,
      getCanvasViewportCenterWorld,
      setCanvasViewportCenterWorldGetter,
      focusGroupOnCanvas,
      registerFocusGroupHandler,
    ],
  );

  return (
    <CanvasWorkspaceContext.Provider value={value}>
      {children}
    </CanvasWorkspaceContext.Provider>
  );
}

export function useCanvasWorkspace(): CanvasWorkspaceValue {
  const ctx = useContext(CanvasWorkspaceContext);
  if (!ctx) {
    throw new Error("useCanvasWorkspace must be used within CanvasWorkspaceProvider");
  }
  return ctx;
}
