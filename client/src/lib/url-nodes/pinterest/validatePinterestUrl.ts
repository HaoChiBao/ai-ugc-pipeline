/**
 * Accept Pinterest pin URLs and pin.it short links for canvas + oEmbed.
 */
export function normalizePinterestUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  let u = t;
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u.replace(/^\/+/, "")}`;
  }
  try {
    const url = new URL(u);
    const host = url.hostname.toLowerCase();
    if (host === "pin.it" || host.endsWith(".pin.it")) {
      return url.toString();
    }
    if (host === "pinterest.com" || host.endsWith(".pinterest.com")) {
      if (url.pathname.includes("/pin/")) {
        // Regional hosts (ca.pinterest.com, uk.pinterest.com, …) work in the browser but
        // oEmbed / gallery-dl are more reliable against www.
        if (host !== "www.pinterest.com" && host !== "pinterest.com") {
          url.hostname = "www.pinterest.com";
        }
        return url.toString();
      }
    }
  } catch {
    return null;
  }
  return null;
}
