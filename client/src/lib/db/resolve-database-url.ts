/**
 * Resolves `DATABASE_URL` for Drizzle. Supports `[DB_PASSWORD]` placeholder.
 * - **`USE_LOCAL_POSTGRES=true`:** Uses `LOCAL_DATABASE_URL` or Docker default `postgresql://postgres:postgres@localhost:5432/ai_ugc`.
 *   Ignores cloud `DATABASE_URL` / Supabase — use for local dev without pooler issues.
 * - **Local Postgres:** `postgresql://user:pass@localhost:5432/dbname` — no SSL or Supabase rewrites.
 * - **Supabase cloud:** If `SUPABASE_DB_REGION` is set, `db.<ref>.supabase.co` (any port) is rewritten to the
 *   **session pooler** `aws-<n>-<region>.pooler.supabase.com:5432` with user `postgres.<ref>` — IPv4-friendly.
 *   (Plain `db.*` often ENOTFOUND on IPv4-only DNS.) If you get XX000 "Tenant not found", try
 *   `SUPABASE_POOLER_AWS_INDEX=1` or paste `SUPABASE_POOLER_HOST` from Dashboard → Connect → Session.
 */
export function extractProjectRefFromSupabaseUrl(supabaseUrl: string): string | null {
  try {
    const u = new URL(supabaseUrl);
    const m = /^([a-z0-9]+)\.supabase\.co$/i.exec(u.hostname);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function isLocalPostgresHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "host.docker.internal" ||
    h.endsWith(".local")
  );
}

function finalizeDatabaseUrl(raw: string, env: NodeJS.ProcessEnv): string {
  let out = raw.trim();
  if (out.includes("[DB_PASSWORD]")) {
    const pw = env.DB_PASSWORD?.trim();
    if (!pw) {
      throw new Error(
        "DATABASE_URL contains [DB_PASSWORD] but DB_PASSWORD is not set (or paste the full URI with an encoded password)",
      );
    }
    out = out.replace("[DB_PASSWORD]", encodeURIComponent(pw));
  }

  let parsed: URL;
  try {
    parsed = new URL(out);
  } catch {
    return out;
  }

  if (
    parsed.hostname.includes("supabase.co") &&
    !isLocalPostgresHostname(parsed.hostname) &&
    !/[?&]sslmode=/.test(out)
  ) {
    out += out.includes("?") ? "&" : "?";
    out += "sslmode=require";
  }
  return out;
}

/**
 * If URL targets `db.<ref>.supabase.co`, rewrite to shared session pooler (IPv4).
 */
export function rewriteSupabaseDbHostToSessionPooler(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const region = env.SUPABASE_DB_REGION?.trim();
  if (!region) return url;

  const disabled =
    env.SUPABASE_USE_SESSION_POOLER === "false" ||
    env.SUPABASE_USE_SESSION_POOLER === "0";
  if (disabled) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (isLocalPostgresHostname(parsed.hostname)) return url;

  const m = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(parsed.hostname);
  if (!m) return url;

  const ref = m[1];
  const awsIndex = env.SUPABASE_POOLER_AWS_INDEX?.trim() || "0";
  const poolHost =
    env.SUPABASE_POOLER_HOST?.trim() ||
    `aws-${awsIndex}-${region}.pooler.supabase.com`;

  const password = parsed.password;
  const encodedPw = encodeURIComponent(password);
  const user = `postgres.${ref}`;

  let search = parsed.search || "";
  if (!/[?&]sslmode=/.test(search)) {
    search += search ? "&" : "?";
    search += "sslmode=require";
  }

  const pathname = parsed.pathname || "/postgres";
  return `postgresql://${encodeURIComponent(user)}:${encodedPw}@${poolHost}:5432${pathname}${search}`;
}

export function resolveDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const useLocal =
    env.USE_LOCAL_POSTGRES === "true" || env.USE_LOCAL_POSTGRES === "1";
  if (useLocal) {
    const raw =
      env.LOCAL_DATABASE_URL?.trim() ||
      "postgresql://postgres:postgres@localhost:5432/ai_ugc";
    return finalizeDatabaseUrl(raw, env);
  }

  const explicit = env.DATABASE_URL?.trim();

  if (explicit) {
    const finalized = finalizeDatabaseUrl(explicit, env);
    return rewriteSupabaseDbHostToSessionPooler(finalized, env);
  }

  const supabaseUrl =
    env.NEXT_PUBLIC_SUPABASE_URL?.trim() || env.SUPABASE_URL?.trim();
  const dbPassword = env.DB_PASSWORD?.trim();
  const ref = supabaseUrl
    ? extractProjectRefFromSupabaseUrl(supabaseUrl)
    : null;

  if (!ref || !dbPassword) {
    throw new Error(
      "Set DATABASE_URL (e.g. postgresql://postgres:postgres@localhost:5432/ai_ugc), or use Supabase envs for auto pooler URL",
    );
  }

  const pw = encodeURIComponent(dbPassword);
  const mode = (env.SUPABASE_POOLER_MODE?.trim() || "session").toLowerCase();

  if (mode === "transaction") {
    return `postgresql://postgres:${pw}@db.${ref}.supabase.co:6543/postgres?sslmode=require`;
  }

  const region = env.SUPABASE_DB_REGION?.trim();
  if (!region) {
    throw new Error(
      "SUPABASE_POOLER_MODE=session (default) requires SUPABASE_DB_REGION (e.g. us-west-2)",
    );
  }
  const awsIndex = env.SUPABASE_POOLER_AWS_INDEX?.trim() || "0";
  const host =
    env.SUPABASE_POOLER_HOST?.trim() ||
    `aws-${awsIndex}-${region}.pooler.supabase.com`;
  return `postgresql://postgres.${ref}:${pw}@${host}:5432/postgres?sslmode=require`;
}
