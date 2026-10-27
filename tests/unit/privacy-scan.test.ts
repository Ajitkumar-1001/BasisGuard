import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SELF = "tests/unit/privacy-scan.test.ts";
const SKIP_FILES = new Set([SELF, "pnpm-lock.yaml"]);
const IGNORE_DIRECTIVES = [".agents/", ".claude/", ".codex/", "CLAUDE.md", "CLAUDE.local.md"];

/** Findings accepted as known. A finding not listed fails; a listed item no longer found also fails. */
export const EXPECTED_FINDINGS: string[] = [];

const PATH_DIRS = ["docs/", ".claude/", ".agents/"];
const PATH_FILE_RES = [/(^|\/)(CLAUDE|AGENTS)\.md$/i, /[\w-]*(prompt|plan)[\w-]*\.md\b/i];
const PATH_MSG_RES = [/\b(CLAUDE|AGENTS)\.md\b/i, /[\w-]*(prompt|plan)[\w-]*\.md\b/i];
const NAME_RE = /\b(claude|codex|copilot|chatgpt|anthropic)\b/i;

const git = (...args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
const messages = git("log", "--format=%H%x00%B%x01", "HEAD")
  .split("\x01")
  .map((s) => s.replace(/^\n/, ""))
  .filter((s) => s.includes("\0"))
  .map((s) => {
    const [sha, body] = s.split("\0");
    return { sha: (sha ?? "").slice(0, 12), body: body ?? "" };
  });

function hasPathMarker(text: string, fileRes: RegExp[]): boolean {
  const lower = text.toLowerCase();
  return PATH_DIRS.some((d) => lower.includes(d)) || fileRes.some((re) => re.test(text));
}

function isBinary(buf: Buffer): boolean {
  return buf.subarray(0, 8000).includes(0);
}

function scan(): string[] {
  const findings: string[] = [];
  for (const p of tracked) {
    if (hasPathMarker(p, PATH_FILE_RES)) findings.push(`path:${p}`);
  }
  for (const m of messages) {
    for (const line of m.body.split("\n")) {
      if (hasPathMarker(line, PATH_MSG_RES)) findings.push(`message-path:${m.sha}:${line.trim()}`);
      if (NAME_RE.test(line)) findings.push(`message-name:${m.sha}:${line.trim()}`);
    }
  }
  for (const p of tracked) {
    if (SKIP_FILES.has(p)) continue;
    let buf: Buffer;
    try {
      buf = readFileSync(join(ROOT, p));
    } catch {
      continue; // tracked but deleted in the working tree
    }
    if (isBinary(buf)) continue;
    const lines = buf.toString("utf8").split("\n");
    lines.forEach((line, i) => {
      if (p === ".gitignore" && IGNORE_DIRECTIVES.includes(line.trim())) return;
      if (NAME_RE.test(line)) findings.push(`content:${p}:${i + 1}`);
    });
  }
  return findings;
}

describe("repository privacy scan", () => {
  it("keeps local tool directories ignored", () => {
    const lines = readFileSync(join(ROOT, ".gitignore"), "utf8").split("\n").map((l) => l.trim());
    for (const d of IGNORE_DIRECTIVES) expect(lines).toContain(d);
  });

  it("finds only expected markers in tracked files and commit messages", () => {
    const findings = scan();
    const unexpected = findings.filter((f) => !EXPECTED_FINDINGS.includes(f));
    const stale = EXPECTED_FINDINGS.filter((f) => !findings.includes(f));
    expect(unexpected).toEqual([]);
    expect(stale).toEqual([]);
  });
});
