import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  adfFromText,
  textFromAdf,
  getMyself,
  fetchAssignedIssues,
  addWorklog,
  JiraApiError,
} from "./client";

const creds = {
  siteUrl: "https://example.atlassian.net/",
  email: "user@example.com",
  apiToken: "token",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ADF helpers", () => {
  it("converts text to ADF paragraphs", () => {
    const adf = adfFromText("riga uno\nriga due");
    expect(adf.type).toBe("doc");
    expect(adf.content).toHaveLength(2);
    expect(adf.content[0].content[0]).toEqual({ type: "text", text: "riga uno" });
  });

  it("converts ADF back to plain text", () => {
    expect(textFromAdf(adfFromText("ciao\nmondo")).trim()).toBe("ciao\nmondo");
  });

  it("handles strings and nullish values", () => {
    expect(textFromAdf("plain")).toBe("plain");
    expect(textFromAdf(undefined)).toBe("");
    expect(textFromAdf(null)).toBe("");
  });
});

describe("Jira API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends basic auth and normalizes the site URL", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ accountId: "abc", displayName: "Mario" }),
    );
    const me = await getMyself(creds);
    expect(me.accountId).toBe("abc");
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://example.atlassian.net/rest/api/3/myself");
    const expected =
      "Basic " + Buffer.from("user@example.com:token").toString("base64");
    expect((init.headers as Record<string, string>).Authorization).toBe(expected);
  });

  it("throws JiraApiError with Jira error messages", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ errorMessages: ["Site does not exist"] }, 404),
    );
    await expect(getMyself(creds)).rejects.toMatchObject({
      name: "JiraApiError",
      status: 404,
      message: "Site does not exist",
    });

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ errorMessages: ["Unauthorized"] }, 401),
    );
    await expect(getMyself(creds)).rejects.toBeInstanceOf(JiraApiError);
  });

  it("paginates the JQL search until isLast", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(
      jsonResponse({
        issues: [{ id: "1", key: "PRJ-1", fields: { summary: "A" } }],
        nextPageToken: "tok2",
        isLast: false,
      }),
    );
    mock.mockResolvedValueOnce(
      jsonResponse({
        issues: [{ id: "2", key: "PRJ-2", fields: { summary: "B" } }],
        isLast: true,
      }),
    );
    const issues = await fetchAssignedIssues(creds);
    expect(issues.map((i) => i.key)).toEqual(["PRJ-1", "PRJ-2"]);
    expect(mock).toHaveBeenCalledTimes(2);
    expect(String(mock.mock.calls[1][0])).toContain("nextPageToken=tok2");
  });

  it("posts a worklog with ADF comment", async () => {
    const mock = fetch as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce(
      jsonResponse({ id: "10001", timeSpentSeconds: 3600 }),
    );
    const wl = await addWorklog(creds, "PRJ-1", {
      timeSpentSeconds: 3600,
      started: "2026-07-20T10:00:00.000+0000",
      comment: "lavoro svolto",
    });
    expect(wl.id).toBe("10001");
    const [url, init] = mock.mock.calls[0];
    expect(String(url)).toContain("/rest/api/3/issue/PRJ-1/worklog");
    const body = JSON.parse(String(init?.body));
    expect(body.timeSpentSeconds).toBe(3600);
    expect(body.comment.type).toBe("doc");
  });
});
