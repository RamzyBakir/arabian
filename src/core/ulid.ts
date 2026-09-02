import { randomBytes } from "node:crypto";

// Crockford base32: no I, L, O, U.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;

let lastTime = -1;
let lastRandom: number[] = [];

function encodeTime(now: number): string {
  const mods: string[] = new Array(TIME_LEN);
  let t = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    mods[i] = ALPHABET[t % 32]!;
    t = Math.floor(t / 32);
  }
  return mods.join("");
}

function randomChars(): number[] {
  const bytes = randomBytes(RANDOM_LEN); // 80 bits
  const chars: number[] = [];
  for (let i = 0; i < RANDOM_LEN; i++) {
    chars.push(bytes[i]! & 0x1f);
  }
  return chars;
}

function increment(chars: number[]): number[] | null {
  for (let i = chars.length - 1; i >= 0; i--) {
    if (chars[i]! < 31) {
      const next = chars.slice();
      next[i] = chars[i]! + 1;
      return next;
    }
  }
  return null; // overflow: fall through to fresh randomness
}

/**
 * Monotonic ULID: within the same millisecond, randomness is incremented
 * so IDs stay sortable by creation order.
 */
export function ulid(now: number = Date.now()): string {
  let rand: number[];
  if (now === lastTime) {
    rand = increment(lastRandom) ?? randomChars();
  } else {
    rand = randomChars();
  }
  lastTime = now;
  lastRandom = rand;
  return encodeTime(now) + rand.map((c) => ALPHABET[c]).join("");
}

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isUlid(s: string): boolean {
  return ULID_RE.test(s);
}

/** Extract the timestamp from a ULID. */
export function ulidTime(id: string): number {
  let t = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    t = t * 32 + ALPHABET.indexOf(id[i]!);
  }
  return t;
}
