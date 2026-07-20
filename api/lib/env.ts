import "dotenv/config";

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  /** SQLite file path, or ":memory:" for tests */
  databaseUrl: process.env.DATABASE_URL || "./data/app.db",
  /** Secret used to encrypt Jira API tokens at rest and sign nothing else */
  sessionSecret:
    process.env.SESSION_SECRET || "jira-time-tracker-dev-secret-change-me",
  /** Session lifetime in days */
  sessionDays: Number(process.env.SESSION_DAYS || 30),
};
