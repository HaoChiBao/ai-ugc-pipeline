export type CanvasItemType = "image";

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

export type CanvasItem = ImageCanvasItem;

export type ViewportState = {
  panX: number;
  panY: number;
  zoom: number;
};

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const DEFAULT_ZOOM = 1;
