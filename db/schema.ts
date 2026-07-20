import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  siteUrl: text("site_url").notNull(),
  /** "cloud" | "server" */
  deployment: text("deployment").notNull().default("cloud"),
  /** "basic" | "bearer" */
  authType: text("auth_type").notNull().default("basic"),
  /** Cloud: accountId. Server/DC: username (name/key) */
  accountId: text("account_id").notNull(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  encryptedToken: text("encrypted_token").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("idx_sessions_user").on(t.userId)],
);

export const issues = sqliteTable(
  "issues",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jiraId: text("jira_id").notNull(),
    key: text("key").notNull(),
    summary: text("summary").notNull(),
    status: text("status").notNull(),
    statusCategory: text("status_category").notNull().default(""),
    projectKey: text("project_key").notNull(),
    projectName: text("project_name").notNull(),
    issueType: text("issue_type").notNull().default(""),
    priority: text("priority").notNull().default(""),
    timeEstimateSeconds: integer("time_estimate_seconds"),
    timeSpentSeconds: integer("time_spent_seconds"),
    dueDate: text("due_date"),
    jiraUpdated: text("jira_updated"),
    url: text("url").notNull(),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("uq_issues_user_key").on(t.userId, t.key),
    index("idx_issues_user_status").on(t.userId, t.status),
    index("idx_issues_user_project").on(t.userId, t.projectKey),
  ],
);

export const worklogs = sqliteTable(
  "worklogs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issueKey: text("issue_key").notNull(),
    jiraWorklogId: text("jira_worklog_id").notNull(),
    timeSpentSeconds: integer("time_spent_seconds").notNull(),
    started: integer("started", { mode: "timestamp_ms" }).notNull(),
    comment: text("comment").notNull().default(""),
    authorAccountId: text("author_account_id").notNull().default(""),
    jiraCreated: text("jira_created"),
    jiraUpdated: text("jira_updated"),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex("uq_worklogs_user_issue_jira").on(
      t.userId,
      t.issueKey,
      t.jiraWorklogId,
    ),
    index("idx_worklogs_user_started").on(t.userId, t.started),
  ],
);

export const timers = sqliteTable(
  "timers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issueKey: text("issue_key").notNull(),
    /** "running" | "paused" */
    state: text("state").notNull().default("running"),
    /** Start of the current run segment (meaningful when state = running) */
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    /** Seconds accumulated across previous run/pause segments */
    accumulatedSeconds: integer("accumulated_seconds").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("uq_timers_user_issue").on(t.userId, t.issueKey)],
);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type Worklog = typeof worklogs.$inferSelect;
export type Timer = typeof timers.$inferSelect;
