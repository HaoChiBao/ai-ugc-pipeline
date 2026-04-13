"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseProjectUrl, getSupabasePublicKey } from "./public-env";

/** Browser client for uploads and client-side Supabase usage. */
export function createSupabaseBrowserClient() {
  const url = getSupabaseProjectUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or a public Supabase key (NEXT_PUBLIC_SUPABASE_ANON_KEY or publishable key).",
    );
  }
  return createBrowserClient(url, key);
}

/** Alias matching Supabase SSR docs (`createClient`). */
export function createClient() {
  return createSupabaseBrowserClient();
}
