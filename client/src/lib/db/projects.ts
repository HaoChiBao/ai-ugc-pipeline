import "server-only";

import { eq } from "drizzle-orm";
import { db } from "./index";
import { projects } from "./schema";

export async function createProject(input?: { title?: string; userId?: string }) {
  const [row] = await db
    .insert(projects)
    .values({
      title: input?.title ?? "Untitled",
      userId: input?.userId ?? null,
    })
    .returning();
  return row;
}

export async function getProjectById(id: string) {
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  return row ?? null;
}

export async function ensureDefaultProject(): Promise<string> {
  const [first] = await db.select().from(projects).limit(1);
  if (first) return first.id;
  const created = await createProject({ title: "Default" });
  return created.id;
}
