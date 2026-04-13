/** Shorten URL for display inside cards. */
export function compactUrlDisplay(url: string, max = 52): string {
  try {
    const u = new URL(url);
    const withoutProto = `${u.host}${u.pathname}${u.search}`;
    return withoutProto.length > max
      ? `${withoutProto.slice(0, max - 1)}…`
      : withoutProto;
  } catch {
    return url.length > max ? `${url.slice(0, max - 1)}…` : url;
  }
}
