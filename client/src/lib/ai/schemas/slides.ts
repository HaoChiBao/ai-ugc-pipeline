import { z } from "zod";

const contentTypeSchema = z.enum([
  "ranked_list",
  "recommendation_list",
  "educational_breakdown",
  "story_sequence",
]);

const purposeSchema = z.enum(["hook", "setup", "item", "takeaway", "cta"]);

const visualTypeSchema = z.enum([
  "cover",
  "text_card",
  "image_overlay",
  "ranked_item",
  "quote_card",
  "cta_card",
]);

export const slideOutputSchema = z.object({
  order: z.number().int().min(1).max(50),
  purpose: purposeSchema,
  headline: z.string().min(1).max(80),
  body: z.string().max(220).optional(),
  microcopy: z.string().max(100).optional(),
  visualType: visualTypeSchema,
  visualPrompt: z.string().max(900).optional(),
  recommendedReferenceAssetIds: z.array(z.string().uuid()).max(8).optional(),
  generatedAssetId: z.string().uuid().optional(),
  textLayoutNotes: z.array(z.string().max(120)).max(8).optional(),
  referenceUsageNotes: z.array(z.string().max(160)).max(8).optional(),
});

export const generatedProjectResultSchema = z.object({
  title: z.string().min(1).max(120),
  contentType: contentTypeSchema,
  strategySummary: z.string().min(1).max(1200),
  styleDirection: z.object({
    stylePreset: z.string().max(80).optional(),
    tone: z.string().max(80).optional(),
    designNotes: z.array(z.string().max(200)).min(1).max(12),
    fontDirection: z.string().max(200).optional(),
    continuityNotes: z.array(z.string().max(240)).max(12).optional(),
  }),
  slides: z.array(slideOutputSchema).min(1).max(20),
  captionPackage: z.object({
    caption: z.string().min(1).max(2200),
    cta: z.string().max(200).optional(),
    hashtags: z.array(z.string().max(80)).max(30),
  }),
});

export type GeneratedProjectResultParsed = z.infer<
  typeof generatedProjectResultSchema
>;

export function assertSlideCountMatches(
  slides: { order: number }[],
  slideCount?: number,
) {
  if (slideCount == null || slideCount <= 0) return;
  if (slides.length !== slideCount) {
    throw new Error(
      `Expected ${slideCount} slides, got ${slides.length}`,
    );
  }
}
