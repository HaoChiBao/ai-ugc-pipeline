/** oEmbed-shaped payload returned by our API route */
export type TikTokPreviewPayload = {
  title: string;
  thumbnailUrl: string | null;
  authorName: string | null;
  /** True when oEmbed failed but the URL is valid (e.g. photo posts, rate limits). */
  previewLimited?: boolean;
};
