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
      labels: ["backend", "urgent"],
      assignee: { accountId: "acc-123", displayName: "Mario Rossi" },
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
      const jql = new URL(url).searchParams.get("jql") ?? "";
      if (/key = EXT-9/i.test(jql)) {
        return jsonResponse({
          issues: [{
            id: "99",
            key: "EXT-9",
            fields: {
              summary: "Issue di un collega",
              status: { name: "To Do", statusCategory: { name: "To Do" } },
              project: { key: "EXT", name: "External" },
              issuetype: { name: "Task" },
              priority: { name: "Low" },
              labels: ["imported"],
              assignee: { accountId: "someone-else", displayName: "Luigi Verdi" },
              timeestimate: null,
              timespent: null,
              duedate: null,
              updated: "2026-07-20T08:00:00.000+0000",
            },
          }],
          isLast: true,
        });
      }
      if (/key = PRJ-1/i.test(jql)) {
        const done = JSON.parse(JSON.stringify(JIRA_ISSUES[0]));
        done.fields.status = { name: "Done", statusCategory: { name: "Done" } };
        return jsonResponse({ issues: [done], isLast: true });
      }
      return jsonResponse({ issues: JIRA_ISSUES, isLast: true });
    }
    if (url.includes("/transitions") && method === "GET") {
      return jsonResponse({
        transitions: [{ id: "31", name: "Done", to: { name: "Done" } }],
      });
    }
    if (url.includes("/transitions") && method === "POST") {
      return new Response(null, { status: 204 });
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

  it("stores labels and assignee on sync; filters by label", async () => {
    const caller = router.createCaller(authedCtx);
    const list = await caller.issues.list();
    const prj1 = list.issues.find((i) => i.key === "PRJ-1");
    expect(prj1?.labels).toEqual(["backend", "urgent"]);
    expect(prj1?.isMine).toBe(true);
    expect(list.labels).toEqual(["backend", "urgent"]);

    const filtered = await caller.issues.list({ label: "urgent" });
    expect(filtered.issues.map((i) => i.key)).toEqual(["PRJ-1"]);
  });

  it("imports an arbitrary issue by key (not assigned to me)", async () => {
    const caller = router.createCaller(authedCtx);
    const res = await caller.issues.import({ key: "EXT-9" });
    expect(res.imported).toBe("EXT-9");
    const list = await caller.issues.list();
    const ext = list.issues.find((i) => i.key === "EXT-9");
    expect(ext?.isMine).toBe(false);
    expect(ext?.labels).toEqual(["imported"]);
  });

  it("paginates the local catalog server-side", async () => {
    const caller = router.createCaller(authedCtx);
    // catalog: PRJ-1, OPS-7, EXT-9 (updated desc: EXT-9, PRJ-1, OPS-7)
    const p1 = await caller.issues.list({ pageSize: 2, page: 1 });
    expect(p1.total).toBe(3);
    expect(p1.totalPages).toBe(2);
    expect(p1.issues.map((i) => i.key)).toEqual(["EXT-9", "PRJ-1"]);

    const p2 = await caller.issues.list({ pageSize: 2, page: 2 });
    expect(p2.issues.map((i) => i.key)).toEqual(["OPS-7"]);

    // defaults: everything in one page
    const all = await caller.issues.list();
    expect(all.issues).toHaveLength(3);
    expect(all.page).toBe(1);
  });

  it("global search flags imported and ownership", async () => {
    const caller = router.createCaller(authedCtx);
    const results = await caller.issues.search({ query: "EXT-9" });
    expect(results).toHaveLength(1);
    expect(results[0].imported).toBe(true);
    expect(results[0].isMine).toBe(false);
  });

  it("favorites: toggle, ordering, filter and sync preservation", async () => {
    const caller = router.createCaller(authedCtx);

    // star OPS-7
    const toggled = await caller.issues.toggleFavorite({ key: "OPS-7" });
    expect(toggled.favorite).toBe(true);

    // favorites come first in the list
    const list = await caller.issues.list();
    expect(list.issues[0].key).toBe("OPS-7");
    expect(list.issues[0].favorite).toBe(1);

    // favoriteOnly filter
    const only = await caller.issues.list({ favoriteOnly: true });
    expect(only.issues.map((i) => i.key)).toEqual(["OPS-7"]);

    // re-sync must preserve the local favorite flag
    await caller.issues.sync();
    const after = await caller.issues.list({ favoriteOnly: true });
    expect(after.issues.map((i) => i.key)).toEqual(["OPS-7"]);

    // toggle off
    const off = await caller.issues.toggleFavorite({ key: "OPS-7" });
    expect(off.favorite).toBe(false);
    await caller.issues.toggleFavorite({ key: "OPS-7" }); // back on for cleanup test
  });

  it("cleanup deletes only issues without tracked worklogs", async () => {
    const caller = router.createCaller(authedCtx);
    // PRJ-1 has a worklog; OPS-7 is a favorite (kept); EXT-9 has neither → deleted
    const res = await caller.issues.cleanup();
    expect(res.deleted).toBe(1);
    expect(res.kept).toBe(2);
    const list = await caller.issues.list();
    expect(list.issues.map((i) => i.key)).toEqual(["OPS-7", "PRJ-1"]);
  });

  it("transitions an issue to a new status and refreshes it locally", async () => {
    const caller = router.createCaller(authedCtx);
    const res = await caller.issues.transition({ key: "PRJ-1", toStatus: "Done" });
    expect(res.to).toBe("Done");
    const issue = await caller.issues.get({ key: "PRJ-1" });
    expect(issue.status).toBe("Done");
  });

  it("computes dashboard stats from local worklogs", async () => {
    const caller = router.createCaller(authedCtx);
    const stats = await caller.stats.dashboard();
    expect(stats.weekSeconds).toBe(9000);
    expect(stats.monthSeconds).toBe(9000);
    // after cleanup: PRJ-1 (Done) and OPS-7 (favorite, To Do) remain
    expect(stats.issueCount).toBe(2);
    expect(stats.openIssueCount).toBe(1);
    expect(stats.perDay).toHaveLength(14);
    expect(stats.perDay.reduce((a, d) => a + d.seconds, 0)).toBe(9000);
    expect(stats.perProject[0].projectKey).toBe("PRJ");
  });

  it("settings: returns defaults and persists updates", async () => {
    const caller = router.createCaller(authedCtx);
    const defaults = await caller.settings.get();
    expect(defaults.dailyTargetSeconds).toBe(8 * 3600);
    expect(defaults.weeklyTargetSeconds).toBe(40 * 3600);
    expect(defaults.timerAlertMinutes).toBe(120);

    const updated = await caller.settings.update({
      dailyTargetSeconds: 6 * 3600,
      timerAlertMinutes: 90,
      notifyEnabled: 0,
    });
    expect(updated.dailyTargetSeconds).toBe(6 * 3600);
    expect(updated.timerAlertMinutes).toBe(90);
    expect(updated.notifyEnabled).toBe(0);

    const again = await caller.settings.get();
    expect(again.dailyTargetSeconds).toBe(6 * 3600);
  });

  it("reports: groups worklogs by day, issue and project", async () => {
    const caller = router.createCaller(authedCtx);
    // add a second worklog on OPS-7 (PRJ-1 already has 9000s today)
    await caller.worklogs.create({
      issueKey: "OPS-7",
      timeSpent: "1h 30m",
      started: new Date().toISOString(),
      comment: "CI fix",
    });
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);

    const byDay = await caller.reports.generate({
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy: "day",
    });
    expect(byDay.rows).toHaveLength(1);
    expect(byDay.totalSeconds).toBe(9000 + 5400);
    expect(byDay.totalEntries).toBe(2);

    const byIssue = await caller.reports.generate({
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy: "issue",
    });
    expect(byIssue.rows).toHaveLength(2);
    expect(byIssue.rows[0].key).toBe("PRJ-1"); // most seconds first
    expect(byIssue.rows[0].label).toContain("Implementare login");

    const byProject = await caller.reports.generate({
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy: "project",
    });
    expect(byProject.rows.map((r) => r.key).sort()).toEqual(["OPS", "PRJ"]);

    // empty range
    const empty = await caller.reports.generate({
      from: "2020-01-01T00:00:00.000Z",
      to: "2020-01-02T00:00:00.000Z",
      groupBy: "day",
    });
    expect(empty.rows).toHaveLength(0);
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

  describe("outbox (offline queue)", () => {
    const offline = async () => {
      throw new TypeError("fetch failed");
    };

    it("queues create when Jira is unreachable and replays it later", async () => {
      const caller = router.createCaller(authedCtx);
      (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(offline);
      const row = await caller.worklogs.create({
        issueKey: "OPS-7",
        timeSpent: "1h 30m",
        started: new Date("2026-07-20T09:00:00Z").toISOString(),
        comment: "lavoro offline",
      });
      expect(row.jiraWorklogId.startsWith("pending-")).toBe(true);
      expect(row.timeSpentSeconds).toBe(5400);

      let pending = await caller.outbox.list();
      expect(pending).toHaveLength(1);
      expect(pending[0].kind).toBe("create");
      expect(pending[0].issueKey).toBe("OPS-7");

      // visible in the local worklog list while pending
      const local = await caller.worklogs.list({ issueKey: "OPS-7" });
      expect(local.some((w) => w.jiraWorklogId === row.jiraWorklogId)).toBe(true);

      // Jira back: manual replay flushes the queue
      const res = await caller.outbox.retry();
      expect(res.synced).toBe(1);
      expect(res.remaining).toBe(0);
      pending = await caller.outbox.list();
      expect(pending).toHaveLength(0);

      // the local row now carries the real Jira id
      const after = await caller.worklogs.list({ issueKey: "OPS-7" });
      expect(after.some((w) => w.jiraWorklogId.startsWith("pending-"))).toBe(false);
      expect(
        after.some((w) => w.jiraWorklogId === "wl-1" && w.comment === "lavoro offline"),
      ).toBe(true);
    });

    it("updates and deletes a pending worklog without touching Jira", async () => {
      const caller = router.createCaller(authedCtx);
      (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(offline);
      const row = await caller.worklogs.create({
        issueKey: "OPS-7",
        timeSpent: "30m",
        started: new Date("2026-07-20T14:00:00Z").toISOString(),
        comment: "bozza",
      });
      const callsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;

      const updated = await caller.worklogs.update({
        issueKey: "OPS-7",
        jiraWorklogId: row.jiraWorklogId,
        timeSpent: "45m",
        started: new Date("2026-07-20T14:30:00Z").toISOString(),
        comment: "bozza corretta",
      });
      expect(updated.timeSpentSeconds).toBe(2700);
      // no Jira call happened for the pending update
      expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
      const ops = await caller.outbox.list();
      expect(ops).toHaveLength(1);
      expect(ops[0].timeSpentSeconds).toBe(2700);
      expect(ops[0].comment).toBe("bozza corretta");

      await caller.worklogs.delete({
        issueKey: "OPS-7",
        jiraWorklogId: row.jiraWorklogId,
      });
      expect(await caller.outbox.list()).toHaveLength(0);
      const local = await caller.worklogs.list({ issueKey: "OPS-7" });
      expect(local.some((w) => w.jiraWorklogId === row.jiraWorklogId)).toBe(false);
    });

    it("queues delete when offline and tolerates 404 on replay", async () => {
      const caller = router.createCaller(authedCtx);
      const row = await caller.worklogs.create({
        issueKey: "OPS-7",
        timeSpent: "20m",
        started: new Date("2026-07-20T16:00:00Z").toISOString(),
        comment: "da eliminare",
      });
      expect(row.jiraWorklogId).toBe("wl-1");

      (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(offline);
      await caller.worklogs.delete({ issueKey: "OPS-7", jiraWorklogId: "wl-1" });
      const ops = await caller.outbox.list();
      expect(ops).toHaveLength(1);
      expect(ops[0].kind).toBe("delete");
      const local = await caller.worklogs.list({ issueKey: "OPS-7" });
      expect(local.some((w) => w.jiraWorklogId === "wl-1")).toBe(false);

      // Replay: Jira answers 404 (already deleted there) → entry cleared
      (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(async () =>
        jsonResponse({ errorMessages: ["not found"] }, 404),
      );
      const res = await caller.outbox.retry();
      expect(res.remaining).toBe(0);
      expect(await caller.outbox.list()).toHaveLength(0);
    });

    it("flushes the queue automatically on issue sync", async () => {
      const caller = router.createCaller(authedCtx);
      (fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(offline);
      await caller.worklogs.create({
        issueKey: "PRJ-1",
        timeSpent: "15m",
        started: new Date("2026-07-20T18:00:00Z").toISOString(),
        comment: "auto replay",
      });
      expect(await caller.outbox.list()).toHaveLength(1);

      const res = await caller.issues.sync();
      expect(res.outbox.remaining).toBe(0);
      expect(await caller.outbox.list()).toHaveLength(0);
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
