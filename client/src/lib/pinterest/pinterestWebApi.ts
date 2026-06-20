import "server-only";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PIN_PAGE_RE =
  /https?:\/\/(?:\w+\.)?pinterest\.[^/]+\/pin\/(\d+)/i;
const APP_VERSION_RE = /"appVersion"\s*:\s*"([^"]+)"/;

export type PinterestSession = {
  cookieHeader: string;
  csrfToken: string;
  appVersion: string;
};

export type PinterestImageResult = {
  pinId: string;
  pinUrl: string;
  imageUrl: string;
};

type PinRecord = {
  id?: string;
  link?: string;
  images?: Record<string, { url?: string }>;
};

function isProbablyPinLink(raw: string): boolean {
  const low = raw.toLowerCase();
  return low.includes("pin.it/") || (low.includes("pinterest.") && low.includes("/pin/"));
}

function pinUrlFromId(pinId: string): string {
  return `https://www.pinterest.com/pin/${pinId}/`;
}

function pickImageUrl(pin: PinRecord): string | null {
  const images = pin.images;
  if (!images) return null;
  for (const key of ["orig", "736x", "564x", "474x", "236x"] as const) {
    const url = images[key]?.url;
    if (url) return url;
  }
  return null;
}

function parseSetCookies(res: Response): Record<string, string> {
  const jar: Record<string, string> = {};
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [];
  for (const line of setCookies) {
    const part = line.split(";")[0]?.trim();
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    jar[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return jar;
}

function cookieHeaderFromJar(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function fetchText(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/json,*/*",
      Referer: "https://www.pinterest.com/",
      ...(init?.headers ?? {}),
    },
    redirect: "follow",
  });
}

/** Resolve a pin.it or regional pin URL to a numeric pin id. */
export async function resolvePinterestPinId(raw: string): Promise<string | null> {
  const trimmed = raw.trim();
  const direct = trimmed.match(PIN_PAGE_RE);
  if (direct?.[1]) return direct[1];

  const low = trimmed.toLowerCase();
  if (!low.includes("pin.it/")) return null;

  let url = trimmed;
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url.replace(/^\/+/, "")}`;
  }

  const res = await fetchText(url, { redirect: "follow" });
  const finalUrl = res.url || url;
  const fromFinal = finalUrl.match(PIN_PAGE_RE);
  if (fromFinal?.[1]) return fromFinal[1];

  const html = await res.text();
  const fromHtml = html.match(PIN_PAGE_RE);
  return fromHtml?.[1] ?? null;
}

/** Bootstrap Pinterest web session cookies by loading a pin page once. */
export async function createPinterestSession(
  seedUrl: string,
): Promise<PinterestSession> {
  let pageUrl = seedUrl.trim();
  if (!/^https?:\/\//i.test(pageUrl)) {
    pageUrl = `https://${pageUrl.replace(/^\/+/, "")}`;
  }
  if (!PIN_PAGE_RE.test(pageUrl)) {
    const pinId = await resolvePinterestPinId(pageUrl);
    if (!pinId) {
      throw new Error("Could not resolve Pinterest pin URL");
    }
    pageUrl = pinUrlFromId(pinId);
  }

  const res = await fetchText(pageUrl);
  if (!res.ok) {
    throw new Error(`Pinterest page returned ${res.status}`);
  }

  const html = await res.text();
  const jar = parseSetCookies(res);
  const appMatch = html.match(APP_VERSION_RE);
  const appVersion = appMatch?.[1] ?? "8048c97";

  let csrfToken = jar.csrftoken;
  if (!csrfToken) {
    const csrfMatch = html.match(/"csrftoken"\s*:\s*"([^"]+)"/);
    csrfToken = csrfMatch?.[1] ?? "";
  }
  if (!csrfToken) {
    throw new Error("Pinterest did not return a CSRF token");
  }
  jar.csrftoken = csrfToken;

  return {
    cookieHeader: cookieHeaderFromJar(jar),
    csrfToken,
    appVersion,
  };
}

async function callPinterestResource<TData>(
  session: PinterestSession,
  resource: string,
  options: Record<string, unknown>,
  sourceUrl = "",
): Promise<{ data: TData; bookmark?: string | null }> {
  const payload = encodeURIComponent(
    JSON.stringify({ options }),
  );
  const url =
    `https://www.pinterest.com/resource/${resource}Resource/get/` +
    `?data=${payload}&source_url=${encodeURIComponent(sourceUrl)}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      "X-APP-VERSION": session.appVersion,
      "X-Pinterest-AppState": "active",
      "X-Pinterest-PWS-Handler": "www/pin/[id].js",
      "Alt-Used": "www.pinterest.com",
      Cookie: session.cookieHeader,
      "X-CSRFToken": session.csrfToken,
      "X-Pinterest-Source-Url": sourceUrl || "/",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      text.slice(0, 200) || `Pinterest API returned ${res.status}`,
    );
  }

  let parsed: {
    resource_response?: {
      data?: TData | { results?: PinRecord[] };
      error?: unknown;
    };
    resource?: { options?: { bookmarks?: string[] } };
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error("Pinterest API returned invalid JSON");
  }

  const envelope = parsed.resource_response;
  if (!envelope) {
    throw new Error("Pinterest API response missing resource_response");
  }

  const rawData = envelope.data;
  const bookmark = parsed.resource?.options?.bookmarks?.[0] ?? null;

  if (Array.isArray(rawData)) {
    return { data: rawData as TData, bookmark };
  }
  if (
    rawData &&
    typeof rawData === "object" &&
    "results" in rawData &&
    Array.isArray((rawData as { results?: PinRecord[] }).results)
  ) {
    return {
      data: (rawData as { results: PinRecord[] }).results as TData,
      bookmark,
    };
  }

  return { data: rawData as TData, bookmark };
}

function mapPinsToImages(pins: PinRecord[]): PinterestImageResult[] {
  const out: PinterestImageResult[] = [];
  for (const pin of pins) {
    const pinId = pin.id?.trim();
    const imageUrl = pickImageUrl(pin);
    if (!pinId || !imageUrl) continue;
    out.push({
      pinId,
      pinUrl: pin.link?.trim() || pinUrlFromId(pinId),
      imageUrl,
    });
  }
  return out;
}

/** Related pins for a pin URL (Pinterest “more like this”). */
export async function fetchRelatedPinImages(
  pinUrl: string,
  count: number,
): Promise<PinterestImageResult[]> {
  const pinId = await resolvePinterestPinId(pinUrl);
  if (!pinId) {
    throw new Error("Could not resolve Pinterest pin id from URL");
  }

  const session = await createPinterestSession(pinUrlFromId(pinId));
  const collected: PinterestImageResult[] = [];
  const seen = new Set<string>();
  let bookmarks: string[] | undefined;

  while (collected.length < count) {
    const options: Record<string, unknown> = {
      pin: pinId,
      add_vase: true,
      pins_only: true,
    };
    if (bookmarks?.length) {
      options.bookmarks = bookmarks;
    }

    const { data, bookmark } = await callPinterestResource<PinRecord[]>(
      session,
      "RelatedPinFeed",
      options,
      `/pin/${pinId}/`,
    );

    for (const row of mapPinsToImages(data)) {
      if (seen.has(row.pinId)) continue;
      seen.add(row.pinId);
      collected.push(row);
      if (collected.length >= count) break;
    }

    if (
      collected.length >= count ||
      !bookmark ||
      bookmark === "-end-" ||
      bookmark.startsWith("Y2JOb25lO")
    ) {
      break;
    }
    bookmarks = [bookmark];
  }

  return collected.slice(0, count);
}

/** Keyword search when the query is not a pin URL. */
export async function fetchSearchPinImages(
  query: string,
  count: number,
): Promise<PinterestImageResult[]> {
  const session = await createPinterestSession("https://www.pinterest.com/");
  const collected: PinterestImageResult[] = [];
  const seen = new Set<string>();
  let bookmarks: string[] | undefined;

  while (collected.length < count) {
    const options: Record<string, unknown> = {
      query,
      scope: "pins",
      rs: "typed",
    };
    if (bookmarks?.length) {
      options.bookmarks = bookmarks;
    }

    const { data, bookmark } = await callPinterestResource<PinRecord[]>(
      session,
      "BaseSearch",
      options,
      `/search/pins/?q=${encodeURIComponent(query)}`,
    );

    for (const row of mapPinsToImages(data)) {
      if (seen.has(row.pinId)) continue;
      seen.add(row.pinId);
      collected.push(row);
      if (collected.length >= count) break;
    }

    if (
      collected.length >= count ||
      !bookmark ||
      bookmark === "-end-" ||
      bookmark.startsWith("Y2JOb25lO")
    ) {
      break;
    }
    bookmarks = [bookmark];
  }

  return collected.slice(0, count);
}

export async function fetchPinterestSimilarImages(
  query: string,
  count: number,
): Promise<PinterestImageResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  if (isProbablyPinLink(trimmed)) {
    return fetchRelatedPinImages(trimmed, count);
  }
  return fetchSearchPinImages(trimmed, count);
}
