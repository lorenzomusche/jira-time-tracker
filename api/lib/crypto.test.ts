import { describe, it, expect } from "vitest";
import { encrypt, decrypt, newSessionId } from "./crypto";

describe("crypto", () => {
  it("encrypts and decrypts round-trip", () => {
    const secret = "my-jira-api-token-12345";
    const enc = encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(decrypt(enc)).toBe(secret);
  });

  it("produces different ciphertexts for the same input (random IV)", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });

  it("fails to decrypt tampered payloads", () => {
    const enc = encrypt("secret");
    const parts = enc.split(".");
    parts[2] = parts[2].slice(0, -2) + "AA";
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("generates unique session ids", () => {
    expect(newSessionId()).not.toBe(newSessionId());
  });
});
