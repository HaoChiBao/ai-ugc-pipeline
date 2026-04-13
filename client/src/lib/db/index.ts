import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { resolveDatabaseUrl } from "./resolve-database-url";

type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  pg?: ReturnType<typeof postgres>;
  drizzle?: Db;
  url?: string;
};

function createPostgres(url: string) {
  // Supabase transaction pooler (port 6543) does not support prepared statements.
  // Session pooler (5432 on aws-*-pooler) supports them — keep default prepare.
  const transactionPooler = url.includes(":6543");
  return postgres(url, {
    max: 10,
    ...(transactionPooler ? { prepare: false } : {}),
  });
}

function getDrizzle(): Db {
  const url = resolveDatabaseUrl();
  if (globalForDb.drizzle && globalForDb.url === url) {
    return globalForDb.drizzle;
  }
  if (globalForDb.pg) {
    void globalForDb.pg.end({ timeout: 5 }).catch(() => {});
  }
  globalForDb.url = url;
  globalForDb.pg = createPostgres(url);
  globalForDb.drizzle = drizzle(globalForDb.pg, { schema });
  return globalForDb.drizzle;
}

/**
 * Lazily builds the Drizzle client from the current `process.env` so Next.js dev
 * "Reload env" and pooler/DATABASE_URL changes apply without a stale global
 * `postgres` connection (e.g. still pointing at `db.*.supabase.co` after fixing env).
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const d = getDrizzle();
    const value = Reflect.get(d as object, prop, receiver);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(d);
    }
    return value;
  },
}) as Db;

export { schema };
