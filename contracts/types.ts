export * from "./errors";
export * from "./time";

export type JiraCredentials = {
  siteUrl: string;
  email: string;
  apiToken: string;
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
