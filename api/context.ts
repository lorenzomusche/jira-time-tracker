import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { eq, gt, and } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { sessions, users, type User } from "@db/schema";
import { SESSION_COOKIE } from "@contracts/types";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: User | null;
  sessionId: string | null;
};

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const cookies = parseCookies(opts.req.headers.get("cookie"));
  const sessionId = cookies[SESSION_COOKIE] ?? null;

  let user: User | null = null;
  if (sessionId) {
    const db = getDb();
    const rows = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())),
      )
      .limit(1);
    user = rows[0]?.user ?? null;
  }

  return { req: opts.req, resHeaders: opts.resHeaders, user, sessionId };
}
