import { describe, expect, it } from "vitest";
import { isUlid, ulid, ulidTime } from "./ulid.js";

describe("ulid", () => {
  it("generates 26-char Crockford base32 ids", () => {
    for (let i = 0; i < 100; i++) {
      expect(isUlid(ulid())).toBe(true);
    }
  });

  it("is monotonic within the same millisecond", () => {
    const t = 1_700_000_000_000;
    const a = ulid(t);
    const b = ulid(t);
    const c = ulid(t + 1);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it("round-trips the timestamp", () => {
    const t = 1_234_567_890_123;
    expect(ulidTime(ulid(t))).toBe(t);
  });
});
