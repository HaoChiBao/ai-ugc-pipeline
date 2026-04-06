/**
 * TikTok hostnames we accept (short links and main site).
 * oEmbed resolves vm/vt short URLs server-side.
 */
function isAllowedTikTokHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "tiktok.com" || h.endsWith(".tiktok.com");
}

/**
 * Returns a normalized https URL string if the input is a plausible TikTok URL.
 */
export function normalizeTikTokUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    if (!isAllowedTikTokHost(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function isValidTikTokUrl(input: string): boolean {
  return normalizeTikTokUrl(input) !== null;
}
