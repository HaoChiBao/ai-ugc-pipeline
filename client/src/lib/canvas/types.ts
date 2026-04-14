export type CanvasItemType = "image" | "tiktok" | "pinterest" | "text";

export type CanvasItemBase = {
  id: string;
  type: CanvasItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * Selection-driven stacking: higher values paint above lower ones.
   * Layout zIndex is added as a tie-breaker inside the same priority.
   */
  stackPriority?: number;
};

/** Frozen square grid while expanded; rebuilt when member count changes. */
export type GroupExpandedGridLayout = {
  memberCount: number;
  side: number;
  stride: number;
  cellInner: number;
  gridLeft: number;
  gridTop: number;
};

export type CanvasGroup = {
  id: string;
  /** World point where the collapsed stack is centered */
  collapseCenterX: number;
  collapseCenterY: number;
  /** Editable label (default "group") */
  label: string;
  /** Click-to-keep expanded layout visible */
  expandedPinned: boolean;
  /** Bottom-to-top stack order; ids may be `image` or `pinterest` canvas items */
  memberImageIds: string[];
  /** When expanded: fixed grid until member count changes */
  expandedGrid?: GroupExpandedGridLayout;
};

export type ImageCanvasItem = CanvasItemBase & {
  type: "image";
  /** `blob:` object URL; revoke when removing the item */
  src: string;
  /** Image stack / expand-on-hover group */
  groupId?: string;
  /** Server-side canvas asset id after upload to Supabase */
  canvasAssetId?: string;
  storagePath?: string;
  publicUrl?: string;
  mimeType?: string;
  label?: string;
  note?: string;
  /** Pinterest pin page for this asset (similar downloads); enables Pinterest hover chrome */
  pinterestPinUrl?: string;
  /** How the image fills its frame (slideshow tiles use cover). */
  imageObjectFit?: "contain" | "cover";
};

export type TikTokPreviewStatus = "loading" | "ready" | "error";

export type TikTokAnalysisStatus = "idle" | "loading" | "ready" | "error";

export type TikTokCanvasItem = CanvasItemBase & {
  type: "tiktok";
  url: string;
  title: string;
  thumbnailUrl: string | null;
  authorName: string | null;
  previewStatus: TikTokPreviewStatus;
  previewError?: string;
  /** Vision + metadata extraction for agent context and canvas overlay */
  analysisStatus?: TikTokAnalysisStatus;
  analysisError?: string;
  analysisContextText?: string;
};

export type PinterestPreviewStatus = "loading" | "ready" | "error";

export type PinterestCanvasItem = CanvasItemBase & {
  type: "pinterest";
  url: string;
  title: string;
  thumbnailUrl: string | null;
  authorName: string | null;
  previewStatus: PinterestPreviewStatus;
  previewError?: string;
  /** Same stack / expand model as images */
  groupId?: string;
};

export type TextAlignOption = "left" | "center" | "right";

export type TextCanvasItem = CanvasItemBase & {
  type: "text";
  text: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  color?: string;
  textAlign?: TextAlignOption;
  /** Caption locked to an image; position = fraction of image width/height (center of text box). */
  attachedToImageId?: string;
  /** Caption locked to a Pinterest card (same overlay model as image captions). */
  attachedToPinterestItemId?: string;
  /** 0 = left edge of image, 1 = right; horizontal center of caption (default 0.5). */
  overlayFractionX?: number;
  /** 0 = top, 1 = bottom; vertical center of the text box (e.g. 0.35 = upper third) */
  overlayFractionY?: number;
};

/** Default caption font size (world px) when `fontSize` is omitted. */
export const DEFAULT_CAPTION_FONT_PX = 18;

export type CanvasItem =
  | ImageCanvasItem
  | TikTokCanvasItem
  | PinterestCanvasItem
  | TextCanvasItem;

/** Fetch more related pins; new images are placed in a row below `anchor`. */
export type PinterestSimilarRequest = {
  pinUrl: string;
  anchor: { x: number; y: number; width: number; height: number };
  /** Image that triggered Similar; similar downloads join its group, or a new group is created and this image is added. */
  sourceImageItemId?: string;
  /** Pinterest card that triggered Similar; thumbnail is copied in as the first group image. */
  sourcePinterestItemId?: string;
};

/** Merged patches for reducer updates (geometry + type-specific fields). */
export type CanvasItemPatch = Partial<
  Pick<CanvasItemBase, "x" | "y" | "width" | "height" | "stackPriority">
> &
  Partial<{
    src: string;
    canvasAssetId: string;
    storagePath: string;
    publicUrl: string;
    mimeType: string;
    label: string;
    note: string;
    pinterestPinUrl: string | undefined;
    imageObjectFit: "contain" | "cover";
    url: string;
    title: string;
    thumbnailUrl: string | null;
    authorName: string | null;
    previewStatus: TikTokPreviewStatus | PinterestPreviewStatus;
    previewError: string | undefined;
    analysisStatus: TikTokAnalysisStatus;
    analysisError: string | undefined;
    analysisContextText: string | undefined;
    text: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    color: string;
    textAlign: TextAlignOption;
    groupId: string | undefined;
    attachedToImageId: string | undefined;
    attachedToPinterestItemId: string | undefined;
    overlayFractionX: number;
    overlayFractionY: number;
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
