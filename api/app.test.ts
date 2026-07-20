import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";

// Must be set BEFORE importing env/db modules.
process.env.DATABASE_URL = ":memory:";

import type { appRouter } from "./router";
import type { TrpcContext } from "./context";
import type { User } from "@db/schema";

type Router = typeof appRouter;

const JIRA_ISSUES = [
  {
    id: "1",
    key: "PRJ-1",
    fields: {
      summary: "Implementare login",
      status: { name: "In Progress", statusCategory: { name: "In Progress" } },
      project: { key: "PRJ", name: "Progetto Demo" },
      issuetype: { name: "Story" },
      priority: { name: "High" },
      timeestimate: 28800,
      timespent: 3600,
      duedate: null,
      updated: "2026-07-19T10:00:00.000+0000",
    },
  },
  {
    id: "2",
    key: "OPS-7",
    fields: {
      summary: "Fix pipeline CI",
      status: { name: "To Do", statusCategory: { name: "To Do" } },
      project: { key: "OPS", name: "Operations" },
      issuetype: { name: "Bug" },
      priority: { name: "Medium" },
      timeestimate: null,
      timespent: null,
      duedate: null,
      updated: "2026-07-18T09:00:00.000+0000",
    },
  },
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockJiraFetch() {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/rest/api/3/myself")) {
      return jsonResponse({
        accountId: "acc-123",
        displayName: "Mario Rossi",
        emailAddress: "mario@example.com",
        avatarUrls: { "48x48": "https://example.com/avatar.png" },
      });
    }
    if (url.endsWith("/rest/api/2/myself")) {
      // Jira Server/DC 8.x: no accountId, identified by username
      return jsonResponse({
        name: "mario.rossi",
        key: "mario.rossi",
        displayName: "Mario Rossi",
        emailAddress: "mario@example.com",
      });
    }
    if (url.includes("/rest/api/2/search")) {
      return jsonResponse({ issues: JIRA_ISSUES, total: JIRA_ISSUES.length });
    }
    if (url.includes("/rest/api/3/search/jql")) {
      return jsonResponse({ issues: JIRA_ISSUES, isLast: true });
    }
    if (url.includes("/worklog") && method === "POST") {
      const body = JSON.parse(String(init?.body));
      return jsonResponse({
        id: "wl-1",
        timeSpentSeconds: body.timeSpentSeconds,
        started: body.started,
        comment: body.comment,
        author: { accountId: "acc-123" },
        created: "2026-07-20T10:00:00.000+0000",
        updated: "2026-07-20T10:00:00.000+0000",
      });
    }
    if (url.includes("/worklog") && method === "DELETE") {
      return new Response(null, { status: 204 });
    }
    if (url.includes("/worklog") && method === "GET") {
      return jsonResponse({ worklogs: [] });
    }
    return jsonResponse({ errorMessages: [`unmocked: ${method} ${url}`] }, 500);
  });
}

describe("app router (integration, in-memory SQLite)", () => {
  let router: Router;
  let db: ReturnType<typeof import("./queries/connection").getDb>;
  let authedCtx: TrpcContext;
  let user: User;

  const anonCtx = (): TrpcContext => ({
    req: new Request("http://localhost/api/trpc"),
    resHeaders: new Headers(),
    user: null,
    sessionId: null,
  });

  beforeAll(async () => {
    vi.stubGlobal("fetch", mockJiraFetch());
    ({ appRouter: router } = await import("./router"));
    const conn = await import("./queries/connection");
    conn.resetDbForTests();
    db = conn.getDb();
    const { sessions } = await import("@db/schema");

    // Login
    const res = await router
      .createCaller(anonCtx())
      .auth.login({
        siteUrl: "https://example.atlassian.net",
        deployment: "cloud",
        authType: "basic",
        username: "mario@example.com",
        secret: "secret-token",
      });
    expect(res.displayName).toBe("Mario Rossi");

    const allSessions = await db.select().from(sessions);
    expect(allSessions).toHaveLength(1);

    const { users } = await import("@db/schema");
    const allUsers = await db.select().from(users);
    expect(allUsers).toHaveLength(1);
    user = allUsers[0];
    expect(user.encryptedToken).not.toContain("secret-token");

    authedCtx = {
      req: new Request("http://localhost/api/trpc"),
      resHeaders: new Headers(),
      user,
      sessionId: allSessions[0].id,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects anonymous access to protected procedures", async () => {
    await expect(router.createCaller(anonCtx()).issues.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects invalid Jira credentials", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () =>
      jsonResponse({ errorMessages: ["Unauthorized"] }, 401),
    );
    await expect(
      router.createCaller(anonCtx()).auth.login({
        siteUrl: "https://example.atlassian.net",
        deployment: "cloud",
        authType: "basic",
        username: "mario@example.com",
        secret: "wrong",
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("syncs assigned issues from Jira and lists them with facets", async () => {
    const caller = router.createCaller(authedCtx);
    const sync = await caller.issues.sync();
    expect(sync.synced).toBe(2);

    const list = await caller.issues.list();
    expect(list.issues.map((i) => i.key)).toEqual(["PRJ-1", "OPS-7"]);
    expect(list.statuses).toEqual(["In Progress", "To Do"]);
    expect(list.projects.map((p) => p.key)).toEqual(["OPS", "PRJ"]);

    const filtered = await caller.issues.list({ search: "pipeline" });
    expect(filtered.issues.map((i) => i.key)).toEqual(["OPS-7"]);

    const byStatus = await caller.issues.list({ status: "In Progress" });
    expect(byStatus.issues.map((i) => i.key)).toEqual(["PRJ-1"]);

    // Re-sync updates instead of duplicating
    await caller.issues.sync();
    expect((await caller.issues.list()).issues).toHaveLength(2);
  });

  it("creates a worklog on Jira and stores it locally", async () => {
    const caller = router.createCaller(authedCtx);
    const created = await caller.worklogs.create({
      issueKey: "PRJ-1",
      timeSpent: "2h 30m",
      started: new Date().toISOString(),
      comment: "Sviluppo feature",
    });
    expect(created.timeSpentSeconds).toBe(9000);
    expect(created.jiraWorklogId).toBe("wl-1");
    expect(created.comment).toBe("Sviluppo feature");

    const logs = await caller.worklogs.list({ issueKey: "PRJ-1" });
    expect(logs).toHaveLength(1);
  });

  it("rejects invalid durations", async () => {
    const caller = router.createCaller(authedCtx);
    await expect(
      caller.worklogs.create({
        issueKey: "PRJ-1",
        timeSpent: "un po'",
        started: new Date().toISOString(),
        comment: "",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("computes dashboard stats from local worklogs", async () => {
    const caller = router.createCaller(authedCtx);
    const stats = await caller.stats.dashboard();
    expect(stats.weekSeconds).toBe(9000);
    expect(stats.monthSeconds).toBe(9000);
    expect(stats.issueCount).toBe(2);
    expect(stats.openIssueCount).toBe(2);
    expect(stats.perDay).toHaveLength(14);
    expect(stats.perDay.reduce((a, d) => a + d.seconds, 0)).toBe(9000);
    expect(stats.perProject[0].projectKey).toBe("PRJ");
  });

  it("deletes a worklog from Jira and locally", async () => {
    const caller = router.createCaller(authedCtx);
    await caller.worklogs.delete({ issueKey: "PRJ-1", jiraWorklogId: "wl-1" });
    expect(await caller.worklogs.list({ issueKey: "PRJ-1" })).toHaveLength(0);
  });

  it("supports login against Jira Server/DC 8.x (username + password)", async () => {
    const res = await router.createCaller(anonCtx()).auth.login({
      siteUrl: "https://jira.example.it",
      deployment: "server",
      authType: "basic",
      username: "mario.rossi",
      secret: "password123",
    });
    expect(res.displayName).toBe("Mario Rossi");
    // identified by username (name), not accountId
    expect(res.accountId).toBe("mario.rossi");
  });

  describe("timers (fine tracking)", () => {
    it("starts a timer and tracks elapsed time", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date("2026-07-20T10:00:00Z"));
        const caller = router.createCaller(authedCtx);
        await caller.timers.start({ issueKey: "PRJ-1" });

        vi.setSystemTime(new Date("2026-07-20T10:01:30Z")); // +90s
        const list = await caller.timers.list();
        const t = list.find((x) => x.issueKey === "PRJ-1");
        expect(t?.state).toBe("running");
        expect(t?.elapsedSeconds).toBe(90);
      } finally {
        vi.useRealTimers();
      }
    });

    it("pause accumulates elapsed time; resume continues from it", async () => {
      vi.useFakeTimers();
      try {
        const caller = router.createCaller(authedCtx);
        vi.setSystemTime(new Date("2026-07-20T11:00:00Z"));
        await caller.timers.discard({ issueKey: "PRJ-1" });
        await caller.timers.start({ issueKey: "PRJ-1" });
        vi.setSystemTime(new Date("2026-07-20T11:01:30Z")); // +90s
        await caller.timers.pause({ issueKey: "PRJ-1" });

        vi.setSystemTime(new Date("2026-07-20T11:05:00Z")); // +5m while paused
        let list = await caller.timers.list();
        let t = list.find((x) => x.issueKey === "PRJ-1");
        expect(t?.state).toBe("paused");
        expect(t?.elapsedSeconds).toBe(90); // unchanged while paused

        await caller.timers.start({ issueKey: "PRJ-1" }); // resume
        vi.setSystemTime(new Date("2026-07-20T11:05:30Z")); // +30s
        list = await caller.timers.list();
        t = list.find((x) => x.issueKey === "PRJ-1");
        expect(t?.state).toBe("running");
        expect(t?.elapsedSeconds).toBe(120);
      } finally {
        vi.useRealTimers();
      }
    });

    it("starting another issue auto-pauses the running timer", async () => {
      vi.useFakeTimers();
      try {
        const caller = router.createCaller(authedCtx);
        vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
        await caller.timers.start({ issueKey: "OPS-7" });
        const list = await caller.timers.list();
        expect(list.find((x) => x.issueKey === "PRJ-1")?.state).toBe("paused");
        expect(list.find((x) => x.issueKey === "OPS-7")?.state).toBe("running");
      } finally {
        vi.useRealTimers();
      }
    });

    it("stop returns tracked time rounded up to minutes and clears the timer", async () => {
      vi.useFakeTimers();
      try {
        const caller = router.createCaller(authedCtx);
        vi.setSystemTime(new Date("2026-07-20T12:00:45Z")); // OPS-7 running 45s
        const res = await caller.timers.stop({ issueKey: "OPS-7" });
        expect(res.found).toBe(true);
        expect(res.seconds).toBe(60); // rounded up to whole minutes
        const list = await caller.timers.list();
        expect(list.find((x) => x.issueKey === "OPS-7")).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it("discard removes a timer without logging", async () => {
      const caller = router.createCaller(authedCtx);
      await caller.timers.discard({ issueKey: "PRJ-1" });
      const list = await caller.timers.list();
      expect(list).toHaveLength(0);
    });
  });

  it("logs out and invalidates the session row", async () => {
    const caller = router.createCaller(authedCtx);
    await caller.auth.logout();
    const { sessions } = await import("@db/schema");
    const { eq } = await import("drizzle-orm");
    const remaining = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, authedCtx.sessionId!));
    expect(remaining).toHaveLength(0);
  });
});
