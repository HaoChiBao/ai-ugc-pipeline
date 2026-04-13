/** DNS could not resolve the DB hostname (common for `db.*.supabase.co` on IPv4-only networks). */
export function isPostgresDnsFailure(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
    return true;
  }
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  if (cause instanceof Error) {
    const cm = cause.message;
    if (cm.includes("ENOTFOUND") || cm.includes("getaddrinfo")) return true;
  }
  if (cause && typeof cause === "object" && "code" in cause) {
    return (cause as { code?: string }).code === "ENOTFOUND";
  }
  return false;
}

/** Supabase pooler rejected the connection string (wrong host/user combo — not app auth users). */
export function isPostgresTenantNotFound(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("XX000") || msg.includes("Tenant or user not found")) {
    return true;
  }
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  if (cause && typeof cause === "object" && "code" in cause) {
    return (cause as { code?: string }).code === "XX000";
  }
  return false;
}

/** True when the `postgres` driver failed to authenticate (wrong DATABASE_URL password, etc.). */
export function isPostgresAuthFailure(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes("28P01") || msg.includes("password authentication failed")) {
    return true;
  }
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;
  if (cause && typeof cause === "object" && "code" in cause) {
    return (cause as { code?: string }).code === "28P01";
  }
  return false;
}
