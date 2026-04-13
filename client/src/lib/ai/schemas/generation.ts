import { z } from "zod";

const assetSummarySchema = z.object({
  id: z.string().uuid(),
  publicUrl: z.string().url().optional(),
  storagePath: z.string().optional(),
  bucket: z.string().optional(),
  mimeType: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  selected: z.boolean().optional(),
  label: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
});

const canvasContextSchema = z
  .object({
    boardId: z.string().optional(),
    viewport: z
      .object({
        x: z.number(),
        y: z.number(),
        zoom: z.number(),
      })
      .optional(),
    assetSummaries: z.array(assetSummarySchema).max(24),
  })
  .optional();

const generateSlidesRequestBaseSchema = z.object({
  projectId: z.string().uuid().optional(),
  /** Primary hands-free input: short topic or idea */
  theme: z.string().max(8000).optional(),
  /** @deprecated Prefer `theme` — kept for older clients */
  prompt: z.string().max(8000).optional(),
  mode: z.enum(["grounded", "creative"]),
  stylePreset: z.string().max(120).optional(),
  tone: z.string().max(120).optional(),
  slideCount: z.number().int().min(3).max(15).optional(),
  useSelectedCanvasAssets: z.boolean().optional(),
  includeVisibleCanvasAssets: z.boolean().optional(),
  generateVisuals: z.boolean().optional(),
  selectedCanvasAssetIds: z.array(z.string().uuid()).max(24).optional(),
  canvasContext: canvasContextSchema,
});

export const generateSlidesRequestSchema = generateSlidesRequestBaseSchema
  .transform((data) => {
    const theme = (data.theme?.trim() || data.prompt?.trim() || "").trim();
    return { ...data, theme };
  })
  .refine((d) => d.theme.length > 0, {
    message: "Provide a theme (or legacy prompt)",
    path: ["theme"],
  });

export type GenerateSlidesRequestInput = z.infer<
  typeof generateSlidesRequestSchema
>;
