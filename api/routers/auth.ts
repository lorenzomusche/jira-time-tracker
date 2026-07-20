import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { createRouter, publicQuery, protectedProcedure } from "../middleware";
import { getDb } from "../queries/connection";
import { users, sessions } from "@db/schema";
import { encrypt, newSessionId } from "../lib/crypto";
import { env } from "../lib/env";
import { getMyself, JiraApiError } from "../jira/client";
import { SESSION_COOKIE } from "@contracts/types";

function sessionCookie(sessionId: string, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (env.isProduction) parts.push("Secure");
  return parts.join("; ");
}

export const authRouter = createRouter({
  login: publicQuery
    .input(
      z.object({
        siteUrl: z
          .string()
          .url()
          .transform((u) => u.replace(/\/+$/, "")),
        deployment: z.enum(["cloud", "server"]).default("cloud"),
        /** Cloud: email. Server/DC: username */
        username: z.string().min(1),
        /** Cloud: API token. Server: password (basic) or PAT (bearer) */
        secret: z.string().min(1),
        authType: z.enum(["basic", "bearer"]).default("basic"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const creds = {
        siteUrl: input.siteUrl,
        deployment: input.deployment,
        authType: input.authType,
        username: input.username,
        secret: input.secret,
      };
      let myself;
      try {
        myself = await getMyself(creds);
      } catch (err) {
        if (err instanceof JiraApiError && (err.status === 401 || err.status === 403)) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Credenziali Jira non valide. Controlla email e API token.",
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Impossibile contattare Jira: ${err instanceof Error ? err.message : "errore sconosciuto"}`,
        });
      }

      // Cloud identifies users by accountId; Server/DC 8.x by username (name/key)
      const accountId = myself.accountId ?? myself.name ?? myself.key ?? input.username;

      const db = getDb();
      const existing = await db
        .select()
        .from(users)
        .where(
          and(eq(users.siteUrl, input.siteUrl), eq(users.accountId, accountId)),
        )
        .limit(1);

      const values = {
        deployment: input.deployment,
        authType: input.authType,
        email: input.username,
        displayName: myself.displayName,
        avatarUrl: myself.avatarUrls?.["48x48"] ?? null,
        encryptedToken: encrypt(input.secret),
      };

      let user;
      if (existing[0]) {
        await db.update(users).set(values).where(eq(users.id, existing[0].id));
        user = { ...existing[0], ...values };
      } else {
        const inserted = await db
          .insert(users)
          .values({
            siteUrl: input.siteUrl,
            accountId,
            ...values,
          })
          .returning();
        user = inserted[0];
      }

      const sessionId = newSessionId();
      const maxAge = env.sessionDays * 24 * 3600;
      await db.insert(sessions).values({
        id: sessionId,
        userId: user.id,
        expiresAt: new Date(Date.now() + maxAge * 1000),
      });
      ctx.resHeaders.append("Set-Cookie", sessionCookie(sessionId, maxAge));

      return {
        id: user.id,
        siteUrl: user.siteUrl,
        accountId: user.accountId,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      };
    }),

  me: publicQuery.query(({ ctx }) => {
    if (!ctx.user) return null;
    const u = ctx.user;
    return {
      id: u.id,
      siteUrl: u.siteUrl,
      accountId: u.accountId,
      email: u.email,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
    };
  }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const db = getDb();
    if (ctx.sessionId) {
      await db.delete(sessions).where(eq(sessions.id, ctx.sessionId));
    }
    ctx.resHeaders.append("Set-Cookie", sessionCookie("deleted", 0));
    return { ok: true };
  }),
});
