export * from "./errors";
export * from "./time";

export type JiraDeployment = "cloud" | "server";

export type JiraAuthType = "basic" | "bearer";

export type JiraCredentials = {
  siteUrl: string;
  /** "cloud" = Jira Cloud (API v3, email + API token); "server" = Jira Server/DC 8.x (API v2) */
  deployment: JiraDeployment;
  /** Email (Cloud) o username (Server/DC) */
  username: string;
  /** API token (Cloud), password (Server basic) o Personal Access Token (Server bearer) */
  secret: string;
  /** "basic" = Basic auth; "bearer" = Personal Access Token (solo Server/DC 8.14+) */
  authType: JiraAuthType;
};

export type SessionUser = {
  id: number;
  siteUrl: string;
  accountId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
};

export const SESSION_COOKIE = "jtt_session";
