import "server-only";

import type { GenerateContentResponse, Part } from "@google/genai";
import { buildGeminiSlideshowImageUserText } from "@/lib/ai/prompts/imageGenerationMasterPrompt";
import { getGeminiClient, Modality } from "@/lib/gemini/client";
import { getGeminiImageModel } from "@/lib/gemini/models";
import type { ImageGenerationProvider } from "./provider";
import type { GeneratedImageResult } from "./types";

async function fetchImageAsBase64(
  url: string,
): Promise<{ mimeType: string; data: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Failed to fetch reference image: ${res.status}`);
  const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim()
    ?? "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { mimeType, data: buf.toString("base64") };
}

function collectImagePartFromResponse(
  response: GenerateContentResponse,
): { mimeType: string; buffer: Buffer } | null {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const id = p.inlineData;
    if (id?.data && id.mimeType) {
      return {
        mimeType: id.mimeType,
        buffer: Buffer.from(id.data, "base64"),
      };
    }
  }
  return null;
}

async function runImageModel(input: {
  userParts: Part[];
  model?: string;
}): Promise<GeneratedImageResult> {
  const client = getGeminiClient();
  const model = input.model ?? getGeminiImageModel();
  const response = await client.models.generateContent({
    model,
    contents: [{ role: "user", parts: input.userParts }],
    config: {
      responseModalities: [Modality.IMAGE],
    },
  });

  const raw = collectImagePartFromResponse(response);
  if (!raw) {
    const t = response.text;
    throw new Error(
      `Gemini returned no image data${t ? `: ${t.slice(0, 200)}` : ""}`,
    );
  }

  return {
    buffer: raw.buffer,
    mimeType: raw.mimeType,
  };
}

export function createGeminiImageProvider(): ImageGenerationProvider {
  return {
    async generateFromPrompt(input) {
      const parts: Part[] = [];
      if (input.referenceImages?.length) {
        for (const ref of input.referenceImages.slice(0, 8)) {
          if (!ref.publicUrl) continue;
          const { mimeType, data } = await fetchImageAsBase64(ref.publicUrl);
          parts.push({
            inlineData: {
              mimeType: (ref.mimeType ?? mimeType) as "image/png",
              data,
            },
          });
        }
      }

      let userText: string;
      if (input.cohesiveSlideshow) {
        const cs = input.cohesiveSlideshow;
        userText = buildGeminiSlideshowImageUserText({
          slidePrompt: input.prompt,
          theme: cs.theme,
          slideIndex: cs.slideIndex,
          totalSlides: cs.totalSlides,
          tone: cs.tone,
          stylePreset: input.style,
        });
      } else {
        const style = input.style ? `\nStyle/aesthetic: ${input.style}` : "";
        userText = `${input.prompt}${style}\nGenerate a single image. Do not render overlay text, captions, or typography in the image.`;
      }

      parts.push({ text: userText });
      return runImageModel({ userParts: parts });
    },

    async editWithReferences(input) {
      const parts: Part[] = [];
      for (const src of input.sourceImages.slice(0, 8)) {
        if (!src.publicUrl) continue;
        const { mimeType, data } = await fetchImageAsBase64(src.publicUrl);
        parts.push({
          inlineData: {
            mimeType: (src.mimeType ?? mimeType) as "image/png",
            data,
          },
        });
      }
      parts.push({
        text: `${input.prompt}\nEdit or compose based on the reference image(s). Do not render overlay text in the image.`,
      });
      return runImageModel({ userParts: parts });
    },
  };
}
