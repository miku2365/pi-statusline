import assert from "node:assert/strict";
import { test } from "node:test";
import { gitIsDirty, hasGitDir, parseGitStatusPorcelain } from "../src/git.ts";

test("hasGitDir is false outside a repository", () => {
  assert.equal(hasGitDir("C:\\Windows\\Temp"), false);
});

test("parses porcelain v2 branch headers and entries", () => {
  const summary = parseGitStatusPorcelain(
    [
      "# branch.oid 9224f01a1b2c3d4e5f",
      "# branch.head v2",
      "# branch.upstream origin/v2",
      "# branch.ab +2 -1",
      "1 .M N... 100644 100644 100644 a b src/main.rs",
      "1 M. N... 100644 100644 100644 a b src/lib.rs",
      "1 MM N... 100644 100644 100644 a b Cargo.toml",
      "2 R. N... 100644 100644 100644 a b R100 new.rs\told.rs",
      "u UU N... 100644 100644 100644 100644 a b c conflict.rs",
      "? notes.txt",
      "? tmp/",
      "",
    ].join("\n"),
  );
  assert.equal(summary.branch, "v2");
  assert.equal(summary.oid, "9224f01a1b2c3d4e5f");
  assert.equal(summary.ahead, 2);
  assert.equal(summary.behind, 1);
  assert.equal(summary.staged, 3);
  assert.equal(summary.modified, 2);
  assert.equal(summary.untracked, 2);
  assert.equal(summary.conflicts, 1);
  assert.equal(gitIsDirty(summary), true);
});

test("handles detached and initial commit", () => {
  const summary = parseGitStatusPorcelain("# branch.oid (initial)\n# branch.head (detached)\n");
  assert.equal(summary.branch, undefined);
  assert.equal(summary.oid, undefined);
  assert.equal(gitIsDirty(summary), false);
});

test("parses unborn branch after git init", () => {
  const summary = parseGitStatusPorcelain("# branch.oid (initial)\n# branch.head master\n? README.md\n");
  assert.equal(summary.branch, "master");
  assert.equal(summary.oid, undefined);
  assert.equal(summary.untracked, 1);
  assert.equal(gitIsDirty(summary), true);
});
