export type GenerateSlidesRequest = {
  projectId?: string;
  /** Short topic or idea — primary hands-free input */
  theme: string;
  mode: "grounded" | "creative";
  stylePreset?: string;
  tone?: string;
  slideCount?: number;
  useSelectedCanvasAssets?: boolean;
  includeVisibleCanvasAssets?: boolean;
  generateVisuals?: boolean;
  selectedCanvasAssetIds?: string[];
  canvasContext?: {
    boardId?: string;
    viewport?: {
      x: number;
      y: number;
      zoom: number;
    };
    assetSummaries: {
      id: string;
      publicUrl?: string;
      storagePath?: string;
      bucket?: string;
      mimeType?: string;
      width?: number;
      height?: number;
      x?: number;
      y?: number;
      selected?: boolean;
      label?: string;
      note?: string;
    }[];
  };
};

export type GeneratedProjectResult = {
  title: string;
  contentType:
    | "ranked_list"
    | "recommendation_list"
    | "educational_breakdown"
    | "story_sequence";
  strategySummary: string;
  styleDirection: {
    stylePreset?: string;
    tone?: string;
    designNotes: string[];
    fontDirection?: string;
    /** Cohesion rules for the full slideshow */
    continuityNotes?: string[];
  };
  slides: {
    order: number;
    purpose: "hook" | "setup" | "item" | "takeaway" | "cta";
    headline: string;
    body?: string;
    microcopy?: string;
    visualType:
      | "cover"
      | "text_card"
      | "image_overlay"
      | "ranked_item"
      | "quote_card"
      | "cta_card";
    visualPrompt?: string;
    recommendedReferenceAssetIds?: string[];
    generatedAssetId?: string;
    textLayoutNotes?: string[];
    referenceUsageNotes?: string[];
  }[];
  captionPackage: {
    caption: string;
    cta?: string;
    hashtags: string[];
  };
};
