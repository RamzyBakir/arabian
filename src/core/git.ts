import { execFileSync } from "node:child_process";

/**
 * Run git in `cwd` and return trimmed stdout, or null when git fails
 * (missing binary, not a repo, bad ref...). Callers decide what null means.
 */
export function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
