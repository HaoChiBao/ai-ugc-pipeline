import "server-only";

import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";
import { getSupabaseProjectUrl, getSupabasePublicKey } from "./public-env";

export function createSupabaseServerClient(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
) {
  const url = getSupabaseProjectUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or a public Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY, etc.).",
    );
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot always set cookies; middleware refreshes sessions.
        }
      },
    },
  });
}
