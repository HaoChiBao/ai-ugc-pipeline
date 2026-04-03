"use client";

import { useEffect } from "react";
import { readClipboardImageBlob } from "@/lib/canvas/files";

type Options = {
  enabled?: boolean;
  onImageBlob: (blob: Blob) => void;
  onNonImagePaste?: () => void;
};

export function useCanvasPaste({
  enabled = true,
  onImageBlob,
  onNonImagePaste,
}: Options) {
  useEffect(() => {
    if (!enabled) return;

    const onPaste = (e: ClipboardEvent) => {
      const blob = readClipboardImageBlob(e.clipboardData);
      if (blob) {
        e.preventDefault();
        onImageBlob(blob);
        return;
      }
      const items = e.clipboardData?.items;
      if (items?.length) {
        let hadFileKind = false;
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === "file") {
            hadFileKind = true;
            break;
          }
        }
        if (hadFileKind) {
          onNonImagePaste?.();
        }
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [enabled, onImageBlob, onNonImagePaste]);
}
