import { describe, it, expect } from "vitest";
import {
  parseDurationToSeconds,
  formatSeconds,
  formatHours,
  toJiraStarted,
} from "@contracts/time";

describe("parseDurationToSeconds", () => {
  it("parses plain hours", () => {
    expect(parseDurationToSeconds("2")).toBe(7200);
    expect(parseDurationToSeconds("1.5")).toBe(5400);
  });

  it("parses Jira-style units", () => {
    expect(parseDurationToSeconds("45m")).toBe(2700);
    expect(parseDurationToSeconds("2h")).toBe(7200);
    expect(parseDurationToSeconds("1d")).toBe(8 * 3600);
    expect(parseDurationToSeconds("1w")).toBe(5 * 8 * 3600);
  });

  it("parses composite durations", () => {
    expect(parseDurationToSeconds("2h 30m")).toBe(9000);
    expect(parseDurationToSeconds("1w 2d 3h 4m")).toBe(
      5 * 8 * 3600 + 2 * 8 * 3600 + 3 * 3600 + 4 * 60,
    );
    expect(parseDurationToSeconds("1h30m")).toBe(5400);
  });

  it("is case-insensitive", () => {
    expect(parseDurationToSeconds("2H 30M")).toBe(9000);
  });

  it("rejects invalid input", () => {
    expect(parseDurationToSeconds("")).toBeNull();
    expect(parseDurationToSeconds("abc")).toBeNull();
    expect(parseDurationToSeconds("2x")).toBeNull();
    expect(parseDurationToSeconds("h")).toBeNull();
    expect(parseDurationToSeconds("2h garbage")).toBeNull();
  });
});

describe("formatSeconds", () => {
  it("formats compact durations", () => {
    expect(formatSeconds(0)).toBe("0m");
    expect(formatSeconds(2700)).toBe("45m");
    expect(formatSeconds(7200)).toBe("2h");
    expect(formatSeconds(9000)).toBe("2h 30m");
    expect(formatSeconds(8 * 3600)).toBe("1d");
    expect(formatSeconds(5 * 8 * 3600 + 3600)).toBe("1w 1h");
  });

  it("round-trips with parseDurationToSeconds", () => {
    const values = [600, 3600, 9000, 8 * 3600 + 1800, 5 * 8 * 3600];
    for (const v of values) {
      expect(parseDurationToSeconds(formatSeconds(v))).toBe(v);
    }
  });
});

describe("formatHours", () => {
  it("formats decimal hours", () => {
    expect(formatHours(3600)).toBe("1h");
    expect(formatHours(5400)).toBe("1.5h");
  });
});

describe("toJiraStarted", () => {
  it("produces the Jira worklog format with numeric offset", () => {
    const d = new Date(2026, 6, 20, 14, 30, 5); // local time
    const out = toJiraStarted(d);
    expect(out).toMatch(/^2026-07-20T14:30:05\.000[+-]\d{4}$/);
  });
});
