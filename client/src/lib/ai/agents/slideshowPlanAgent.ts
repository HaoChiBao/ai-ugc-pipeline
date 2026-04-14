import "server-only";

import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions/completions";
import { z } from "zod";
import { buildSlideshowAgentSystemPrompt } from "@/lib/ai/prompts/slideshowAgentPrompt";
import {
  getOpenAILite,
  getOpenAIModelMainFromEnv,
} from "@/lib/openai/client";

export type SlideshowAgentVisionReference = {
  id: string;
  label: string;
  mediaType: string;
  base64: string;
};

const slideOutlineSchema = z.object({
  order: z.number().int().positive(),
  purpose: z.string(),
  headline: z.string(),
  captionGuidance: z.string(),
  /** Concrete on-screen caption text the pipeline should aim for. */
  recommendedCaption: z.string(),
  /** Image-generator framing: angle, distance, POV vs B-roll, environment. */
  shotDirection: z.string(),
  /**
   * Canvas item id of the primary reference (Pinterest / pin-tagged image or TikTok card).
   * Use literal "n/a" when the user message had no reference images attached.
   */
  primaryReferenceId: z.string(),
});

const agentResponseSchema = z.object({
  thinking: z.string(),
  plan: z.string(),
  qualityCheck: z.string(),
  slideOutlines: z.array(slideOutlineSchema),
  executionPrompt: z.string(),
  assistantMessage: z.string(),
});

export type SlideshowPlanAgentResult = z.infer<typeof agentResponseSchema>;

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object");
  }
  const slice = trimmed.slice(start, end + 1);
  return JSON.parse(slice) as unknown;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

function buildLastUserContent(
  text: string,
  references: SlideshowAgentVisionReference[] | undefined,
): string | ChatCompletionContentPart[] {
  const refs = references ?? [];
  if (refs.length === 0) {
    return `${text.trim()}\n\n(No canvas reference images were attached for this turn. Set primaryReferenceId to the literal string "n/a" for every object in slideOutlines.)`;
  }

  const prefix = `${text.trim()}\n\nYou are given labeled reference images from the user's canvas selection. Each image is labeled with its stable canvas id.\n\nRules:\n- In **thinking**, include a section titled exactly "### Reference-to-slide choices" listing each slide order, the chosen **primaryReferenceId**, and one sentence why that reference best fits that beat.\n- In **slideOutlines**, set **primaryReferenceId** to exactly one of the provided ids per slide (pick the strongest visual match).\n- In **executionPrompt**, mention which reference anchors each slide where it helps the image generator.`;

  const parts: ChatCompletionContentPart[] = [{ type: "text", text: prefix }];
  for (const r of refs) {
    parts.push({
      type: "text",
      text: `[canvas reference id=${r.id}] ${r.label}`,
    });
    parts.push({
      type: "image_url",
      image_url: {
        url: `data:${r.mediaType};base64,${r.base64}`,
        detail: "low",
      },
    });
  }
  return parts;
}

export async function runSlideshowPlanAgent(
  messages: ChatTurn[],
  options?: { references?: SlideshowAgentVisionReference[] },
): Promise<SlideshowPlanAgentResult> {
  const openai = getOpenAILite();
  const model = getOpenAIModelMainFromEnv();

  const trimmed = messages
    .filter((m) => m.content.trim().length > 0)
    .slice(-24);

  if (trimmed.length === 0 || trimmed[trimmed.length - 1]!.role !== "user") {
    throw new Error("Last message must be a non-empty user message");
  }

  const openaiMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: buildSlideshowAgentSystemPrompt() },
  ];

  for (let i = 0; i < trimmed.length - 1; i++) {
    const m = trimmed[i]!;
    openaiMessages.push({
      role: m.role as "user" | "assistant",
      content: m.content,
    });
  }

  const last = trimmed[trimmed.length - 1]!;
  openaiMessages.push({
    role: "user",
    content: buildLastUserContent(last.content, options?.references),
  });

  const completion = await openai.chat.completions.create({
    model,
    messages: openaiMessages,
    response_format: { type: "json_object" },
    temperature: 0.65,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty completion from OpenAI");
  }

  const raw = extractJsonObject(content);
  const parsed = agentResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Invalid agent JSON: ${parsed.error.flatten().formErrors.join(", ")}`,
    );
  }

  const out = parsed.data;
  out.slideOutlines.sort((a, b) => a.order - b.order);

  const allowed = new Set(options?.references?.map((r) => r.id) ?? []);
  if (allowed.size > 0) {
    for (const s of out.slideOutlines) {
      if (!allowed.has(s.primaryReferenceId)) {
        throw new Error(
          `Invalid primaryReferenceId "${s.primaryReferenceId}" for slide ${s.order}; allowed: ${[...allowed].join(", ")}`,
        );
      }
    }
  } else {
    for (const s of out.slideOutlines) {
      if (s.primaryReferenceId !== "n/a") {
        throw new Error(
          `When no references are attached, primaryReferenceId must be "n/a" for every slide (slide ${s.order} had "${s.primaryReferenceId}")`,
        );
      }
    }
  }

  return out;
}
