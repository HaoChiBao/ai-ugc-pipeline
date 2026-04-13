"use client";

import { useCallback, useRef } from "react";
import { isImageFile } from "@/lib/canvas/files";

type Options = {
  onFile: (file: File) => void;
  onInvalid?: () => void;
};

export function useCanvasFileInput({ onFile, onInvalid }: Options) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!isImageFile(file)) {
        onInvalid?.();
        return;
      }
      onFile(file);
    },
    [onFile, onInvalid],
  );

  return {
    inputRef,
    openFileDialog,
    onInputChange,
  };
}
