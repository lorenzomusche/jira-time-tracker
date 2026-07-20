import type { JiraCredentials } from "@contracts/types";

/** Thin typed client for the Jira Cloud REST API v3. */

export class JiraApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "JiraApiError";
    this.status = status;
  }
}

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

function authHeader(creds: JiraCredentials): string {
  return (
    "Basic " +
    Buffer.from(`${creds.email}:${creds.apiToken}`).toString("base64")
  );
}

async function jiraFetch<T>(
  creds: JiraCredentials,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `${normalizeSiteUrl(creds.siteUrl)}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: authHeader(creds),
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as {
        errorMessages?: string[];
        errors?: Record<string, string>;
      };
      const msgs = [
        ...(body.errorMessages ?? []),
        ...Object.values(body.errors ?? {}),
      ];
      if (msgs.length > 0) detail = msgs.join("; ");
    } catch {
      /* keep statusText */
    }
    throw new JiraApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------- Types ----------

export type JiraMyself = {
  accountId: string;
  emailAddress?: string;
  displayName: string;
  avatarUrls?: { "48x48"?: string };
};

export type JiraSearchedIssue = {
  id: string;
  key: string;
  fields: {
    summary: string;
    status?: { name?: string; statusCategory?: { name?: string } };
    project?: { key?: string; name?: string };
    issuetype?: { name?: string };
    priority?: { name?: string };
    timeestimate?: number | null;
    timespent?: number | null;
    duedate?: string | null;
    updated?: string;
  };
};

export type JiraWorklog = {
  id: string;
  timeSpentSeconds: number;
  started: string;
  comment?: unknown;
  author?: { accountId?: string; displayName?: string };
  created?: string;
  updated?: string;
};

// ---------- ADF comment helpers ----------

export function adfFromText(text: string) {
  const paragraphs = text.split(/\n+/).filter((l) => l.trim().length > 0);
  return {
    type: "doc",
    version: 1,
    content:
      paragraphs.length > 0
        ? paragraphs.map((line) => ({
            type: "paragraph",
            content: [{ type: "text", text: line }],
          }))
        : [{ type: "paragraph", content: [] }],
  };
}

export function textFromAdf(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textFromAdf).join("");
  if (typeof node === "object") {
    const n = node as { type?: string; text?: string; content?: unknown };
    if (n.type === "text") return n.text ?? "";
    const inner = textFromAdf(n.content);
    if (n.type === "paragraph" || n.type === "heading") return inner + "\n";
    if (n.type === "hardBreak") return "\n";
    return inner;
  }
  return "";
}

// ---------- API calls ----------

export async function getMyself(creds: JiraCredentials): Promise<JiraMyself> {
  return jiraFetch<JiraMyself>(creds, "/rest/api/3/myself");
}

const ISSUE_FIELDS =
  "summary,status,project,issuetype,priority,timeestimate,timespent,duedate,updated";

/** Fetch all issues assigned to the current user (paginates automatically). */
export async function fetchAssignedIssues(
  creds: JiraCredentials,
): Promise<JiraSearchedIssue[]> {
  const out: JiraSearchedIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      jql: "assignee = currentUser() ORDER BY updated DESC",
      fields: ISSUE_FIELDS,
      maxResults: "100",
    });
    if (nextPageToken) params.set("nextPageToken", nextPageToken);
    const page = await jiraFetch<{
      issues?: JiraSearchedIssue[];
      nextPageToken?: string;
      isLast?: boolean;
    }>(creds, `/rest/api/3/search/jql?${params.toString()}`);
    out.push(...(page.issues ?? []));
    nextPageToken = page.isLast === false ? page.nextPageToken : undefined;
  } while (nextPageToken);
  return out;
}

export async function fetchWorklogs(
  creds: JiraCredentials,
  issueKey: string,
): Promise<JiraWorklog[]> {
  const res = await jiraFetch<{ worklogs?: JiraWorklog[] }>(
    creds,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog?maxResults=1000`,
  );
  return res.worklogs ?? [];
}

export async function addWorklog(
  creds: JiraCredentials,
  issueKey: string,
  input: { timeSpentSeconds: number; started: string; comment: string },
): Promise<JiraWorklog> {
  return jiraFetch<JiraWorklog>(
    creds,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog`,
    {
      method: "POST",
      body: JSON.stringify({
        timeSpentSeconds: input.timeSpentSeconds,
        started: input.started,
        comment: adfFromText(input.comment),
      }),
    },
  );
}

export async function updateWorklog(
  creds: JiraCredentials,
  issueKey: string,
  worklogId: string,
  input: { timeSpentSeconds: number; started: string; comment: string },
): Promise<JiraWorklog> {
  return jiraFetch<JiraWorklog>(
    creds,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        timeSpentSeconds: input.timeSpentSeconds,
        started: input.started,
        comment: adfFromText(input.comment),
      }),
    },
  );
}

export async function deleteWorklog(
  creds: JiraCredentials,
  issueKey: string,
  worklogId: string,
): Promise<void> {
  await jiraFetch<void>(
    creds,
    `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog/${encodeURIComponent(worklogId)}`,
    { method: "DELETE" },
  );
}
