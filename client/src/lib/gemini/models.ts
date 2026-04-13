import { getServerEnv } from "@/lib/env/server";

export function getGeminiImageModel(): string {
  return getServerEnv().GEMINI_IMAGE_MODEL;
}

export function getGeminiImageFastModel(): string {
  return getServerEnv().GEMINI_IMAGE_FAST_MODEL;
}
