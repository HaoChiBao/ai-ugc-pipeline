import { normalizePinterestUrl } from "./validatePinterestUrl";

function extractPinterestUrlFromHtml(html: string): string | null {
  const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(html)) !== null) {
    const n = normalizePinterestUrl(m[1]);
    if (n) return n;
  }
  const urlRe =
    /https?:\/\/[^\s"'<>]+/gi;
  let um: RegExpExecArray | null;
  while ((um = urlRe.exec(html)) !== null) {
    const n = normalizePinterestUrl(um[0]);
    if (n) return n;
  }
  return null;
}

/**
 * When the user copies an image from Pinterest, the clipboard often includes
 * `text/html` (or `text/plain`) with the pin page URL alongside the bitmap.
 */
export function extractPinterestPinUrlFromClipboard(
  data: DataTransfer | null,
): string | null {
  if (!data) return null;
  const plain = data.getData("text/plain");
  const fromPlain = normalizePinterestUrl(plain);
  if (fromPlain) return fromPlain;

  const html = data.getData("text/html");
  if (html?.trim()) {
    return extractPinterestUrlFromHtml(html);
  }
  return null;
}
