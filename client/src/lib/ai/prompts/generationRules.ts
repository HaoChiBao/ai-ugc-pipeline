export const SLIDE_TEXT_RULES = `
Text rules:
- Headlines: max ~8 words, punchy, no clickbait lies in grounded mode.
- Body (optional): max ~2 short lines, mobile-friendly.
- Microcopy (optional): tiny supporting line only.
- Do NOT put final slide typography inside visualPrompt; visuals are backgrounds only.
- Slides must follow a coherent list/recommendation arc: hook → setup → items → takeaway → CTA.
`.trim();

export const GROUNDED_VS_CREATIVE = `
Mode:
- grounded: stick to plausible, non-fabricated specifics unless user explicitly asks fiction. Prefer general phrasing over fake product names.
- creative: you may use vivid storytelling and hypothetical examples; still avoid harmful content.
`.trim();

export const CAPTION_RULES = `
Caption package:
- caption: 1–3 short paragraphs max, TikTok-native voice.
- cta: optional single line.
- hashtags: 5–12 relevant tags without spaces; no # prefix required in array strings.
`.trim();
