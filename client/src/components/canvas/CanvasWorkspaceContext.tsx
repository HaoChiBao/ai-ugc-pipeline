"use client";

import { createContext, useContext, useMemo, useState, useCallback } from "react";
import { useCanvasState } from "@/hooks/canvas/useCanvasState";
import { useCanvasViewport } from "@/hooks/canvas/useCanvasViewport";

type CanvasWorkspaceValue = ReturnType<typeof useCanvasState> &
  ReturnType<typeof useCanvasViewport> & {
    projectId: string | null;
    setProjectId: (id: string | null) => void;
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

  const setProjectIdStable = useCallback((id: string | null) => {
    setProjectId(id);
  }, []);

  const value = useMemo(
    () => ({
      ...canvas,
      ...viewport,
      projectId,
      setProjectId: setProjectIdStable,
    }),
    [canvas, viewport, projectId, setProjectIdStable],
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
