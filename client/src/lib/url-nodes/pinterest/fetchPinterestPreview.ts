export type PinterestOEmbedPreview = {
  thumbnailUrl: string | null;
  title: string;
  authorName: string | null;
};

export async function fetchPinterestPreview(
  pinUrl: string,
): Promise<PinterestOEmbedPreview> {
  const qs = new URLSearchParams({ url: pinUrl });
  const res = await fetch(`/api/pinterest/oembed?${qs.toString()}`);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Pinterest preview failed (${res.status})`);
  }
  return (await res.json()) as PinterestOEmbedPreview;
}
