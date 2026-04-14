/** Max width when an image first lands on the canvas (user may resize larger later). */
export const MAX_INITIAL_IMAGE_WIDTH = 500;

/**
 * Fits the image into a max width while preserving aspect ratio.
 * Smaller sources keep their natural width; wide/tall images scale down so width ≤ maxWidth.
 */
export function computeInitialImageSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number = MAX_INITIAL_IMAGE_WIDTH,
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: maxWidth, height: maxWidth };
  }
  const width = Math.min(naturalWidth, maxWidth);
  const height = Math.round((naturalHeight * width) / naturalWidth);
  return { width, height };
}

/**
 * Pinterest oEmbed thumbnails are often much smaller than full pins. Similar images from
 * gallery-dl use {@link computeInitialImageSize} and usually end up `maxWidth` wide. This
 * scales **up** small thumbnails to `maxWidth` so the pin frame matches that visual size.
 */
export function computePinterestThumbnailFrameSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number = MAX_INITIAL_IMAGE_WIDTH,
): { width: number; height: number } {
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: maxWidth, height: maxWidth };
  }
  if (naturalWidth >= maxWidth) {
    return computeInitialImageSize(naturalWidth, naturalHeight, maxWidth);
  }
  const width = maxWidth;
  const height = Math.round((naturalHeight * maxWidth) / naturalWidth);
  return { width, height };
}
