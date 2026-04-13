import { NextResponse } from "next/server";
import {
  isPostgresAuthFailure,
  isPostgresDnsFailure,
  isPostgresTenantNotFound,
} from "@/lib/db/postgres-errors";
import { ensureDefaultProject } from "@/lib/db/projects";

export const runtime = "nodejs";

/** Ensures a default project row exists. (Segment cannot be named `default` — reserved in App Router.) */
export async function GET() {
  try {
    const id = await ensureDefaultProject();
    return NextResponse.json({ id });
  } catch (e) {
    if (isPostgresAuthFailure(e)) {
      return NextResponse.json(
        {
          error: "Database authentication failed",
          hint:
            "Drizzle uses DATABASE_URL (direct Postgres), not the Supabase anon/publishable key. In Supabase: Project Settings → Database → copy the connection string and set DATABASE_URL in .env.local with the database password (URL-encode special characters in the password).",
        },
        { status: 503 },
      );
    }
    if (isPostgresDnsFailure(e)) {
      return NextResponse.json(
        {
          error: "Database hostname could not be resolved (ENOTFOUND)",
          hint:
            "db.<project>.supabase.co often fails on IPv4-only DNS. Set SUPABASE_DB_REGION (e.g. us-west-2) so the app rewrites to the session pooler (aws-*-region.pooler.supabase.com). Or paste the Session URI from Supabase → Connect into DATABASE_URL.",
        },
        { status: 503 },
      );
    }
    if (isPostgresTenantNotFound(e)) {
      return NextResponse.json(
        {
          error: "Supabase pooler rejected the connection",
          hint:
            "This is the Postgres connection (projects, jobs), not file storage. Paste the Session-mode URI from Supabase → Connect into DATABASE_URL, or set SUPABASE_POOLER_HOST to that host and try SUPABASE_POOLER_AWS_INDEX=1. Saving images to a folder only requires LOCAL_STORAGE_ROOT — it does not fix database errors.",
        },
        { status: 503 },
      );
    }
    throw e;
  }
}
