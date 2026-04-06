/** Heuristic: user intended to paste a URL (not prose). */
export function looksLikeWebUrl(s: string): boolean {
  const t = s.trim();
  return /^https?:\/\//i.test(t) || /^www\./i.test(t);
}
