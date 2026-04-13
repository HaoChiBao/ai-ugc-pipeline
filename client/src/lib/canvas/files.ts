const IMAGE_MIME_PREFIX = "image/";

export function isImageMimeType(mime: string): boolean {
  return mime.startsWith(IMAGE_MIME_PREFIX);
}

export function isImageFile(file: File): boolean {
  return isImageMimeType(file.type) || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name);
}

export function createObjectUrl(file: Blob): string {
  return URL.createObjectURL(file);
}

export function revokeObjectUrl(url: string): void {
  if (url.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

/** Load intrinsic dimensions for an image URL (e.g. blob: or http:). */
export function loadImageNaturalSize(
  src: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

export function readClipboardImageBlob(
  dataTransfer: DataTransfer | null,
): Blob | null {
  if (!dataTransfer?.items?.length) return null;
  for (let i = 0; i < dataTransfer.items.length; i++) {
    const item = dataTransfer.items[i];
    if (item.kind === "file" && item.type.startsWith(IMAGE_MIME_PREFIX)) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}
