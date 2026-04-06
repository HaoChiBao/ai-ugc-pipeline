export type CanvasItemType = "image" | "tiktok";

export type CanvasItemBase = {
  id: string;
  type: CanvasItemType;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageCanvasItem = CanvasItemBase & {
  type: "image";
  /** `blob:` object URL; revoke when removing the item */
  src: string;
};

export type TikTokPreviewStatus = "loading" | "ready" | "error";

export type TikTokCanvasItem = CanvasItemBase & {
  type: "tiktok";
  url: string;
  title: string;
  thumbnailUrl: string | null;
  authorName: string | null;
  previewStatus: TikTokPreviewStatus;
  previewError?: string;
};

export type CanvasItem = ImageCanvasItem | TikTokCanvasItem;

/** Merged patches for reducer updates (geometry + type-specific fields). */
export type CanvasItemPatch = Partial<
  Pick<CanvasItemBase, "x" | "y" | "width" | "height">
> &
  Partial<{
    src: string;
    url: string;
    title: string;
    thumbnailUrl: string | null;
    authorName: string | null;
    previewStatus: TikTokPreviewStatus;
    previewError: string | undefined;
  }>;

export type ViewportState = {
  panX: number;
  panY: number;
  zoom: number;
};

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const DEFAULT_ZOOM = 1;

export const DEFAULT_TIKTOK_NODE_WIDTH = 340;
export const DEFAULT_TIKTOK_NODE_HEIGHT = 260;
