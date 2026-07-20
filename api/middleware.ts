import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import type { User } from "@db/schema";
import { decrypt } from "./lib/crypto";
import type { JiraCredentials } from "@contracts/types";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not logged in" });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Build Jira credentials for the authenticated user (decrypts stored token). */
export function credentialsFor(user: User): JiraCredentials {
  return {
    siteUrl: user.siteUrl,
    email: user.email,
    apiToken: decrypt(user.encryptedToken),
  };
}
