/** Prepended to Gemini slideshow image requests for cohesive sequences. */
export const SLIDESHOW_IMAGE_MASTER_PROMPT = `
You are generating a cohesive set of vertical slideshow images for a TikTok-style post.

Your job is to create a sequence of images that feel like they belong to the same story, same aesthetic world, and same emotional moment.

IMPORTANT GOAL:
Do not generate random separate images.
Generate a connected slideshow sequence inspired by the provided reference images and guided by the slide prompt.

The output should feel like:
- multiple moments from the same scene, theme, or storyline
- different angles, crops, details, and visual interpretations of the same concept
- a cohesive visual set for a TikTok slideshow
- consistent subject identity, styling, mood, color palette, and environment when appropriate

REFERENCE IMAGE RULES:
- use the reference images as the primary visual inspiration
- preserve the overall aesthetic, vibe, subject type, composition language, lighting feel, and emotional tone from the references
- if a main subject appears in the references, keep the generated sequence visually consistent with that subject's general appearance, outfit style, silhouette, and energy
- do not copy the reference images exactly
- create new original images that feel inspired by the references
- maintain consistency across the whole generated set

SLIDESHOW COMPOSITION RULES:
each image in the set should represent a different but related visual moment
vary the sequence naturally using:
- wide shots
- medium shots
- close-up details
- side angles
- back views
- motion moments
- environmental storytelling
- silhouette or shadow-based shots
- cropped detail shots such as hands, feet, fabric, hair, reflections, or objects
- mood/transition frames when useful
- POV shots when relevant

The slideshow should feel cinematic, aesthetic, realistic, and intentional.

CONSISTENCY RULES:
- keep all images in vertical 9:16 composition
- keep the same core visual identity across the set
- keep styling cohesive
- keep lighting and color grading coherent unless progression is requested
- avoid drastic outfit/location/subject changes unless explicitly requested
- avoid making each slide feel like a different person or different universe

AESTHETIC PRIORITIES:
- visually appealing for TikTok slideshow content
- realistic and premium-looking
- strong mood
- clean composition
- room for possible text overlay
- not overly cluttered
- not overly artificial unless requested

OUTPUT INTENT:
Generate a series of images that feels like:
- one post
- one mood
- one visual story
- one cohesive slideshow

When deciding what to generate, prioritize:
1. consistency with the references
2. consistency across the slideshow
3. variety of shot types and visual moments
4. alignment with the slide prompt
5. strong TikTok slideshow aesthetic appeal
`.trim();

export function buildGeminiSlideshowImageUserText(input: {
  slidePrompt: string;
  theme: string;
  slideIndex: number;
  totalSlides: number;
  stylePreset?: string;
  tone?: string;
}): string {
  const style = input.stylePreset
    ? `\nBrand style preset: ${input.stylePreset}`
    : "";
  const tone = input.tone ? `\nTone: ${input.tone}` : "";
  return [
    SLIDESHOW_IMAGE_MASTER_PROMPT,
    "",
    "--- This slide ---",
    `Slideshow theme: ${input.theme}`,
    `Slide ${input.slideIndex} of ${input.totalSlides}${style}${tone}`,
    "",
    "Scene / shot direction for this slide:",
    input.slidePrompt,
    "",
    "Generate one vertical 9:16 image only. Do not render overlay text, captions, logos, or typography in the image.",
  ].join("\n");
}
