"use client";

import { useCallback, useRef, useState } from "react";

type Options = {
  onFiles: (files: File[], screenX: number, screenY: number) => void;
};

function hasFileDrag(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer?.types) return false;
  return Array.from(dataTransfer.types).includes("Files");
}

export function useCanvasDrop({ onFiles }: Options) {
  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false);
  const dragDepthRef = useRef(0);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFileOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDraggingFileOver(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasFileDrag(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDraggingFileOver(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length === 0) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      onFiles(files, screenX, screenY);
    },
    [onFiles],
  );

  return {
    isDraggingFileOver,
    dropHandlers: {
      onDragEnter,
      onDragLeave,
      onDragOver,
      onDrop,
    },
  };
}
