import type { GeneratedImageResult } from "./types";

export interface ImageGenerationProvider {
  generateFromPrompt(input: {
    prompt: string;
    referenceImages?: Array<{
      publicUrl?: string;
      mimeType?: string;
    }>;
    style?: string;
    size?: string;
    /** When set, prepends the TikTok cohesive-sequence master prompt and slide context. */
    cohesiveSlideshow?: {
      theme: string;
      slideIndex: number;
      totalSlides: number;
      tone?: string;
    };
  }): Promise<GeneratedImageResult>;

  editWithReferences(input: {
    prompt: string;
    sourceImages: Array<{
      publicUrl?: string;
      mimeType?: string;
    }>;
  }): Promise<GeneratedImageResult>;
}
