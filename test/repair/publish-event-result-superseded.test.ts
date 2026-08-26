import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("publisher terminalizes a verified newer durable tuple without publication", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawsweeper-superseded-"));
  const codeRoot = path.join(root, "code");
  const workRoot = path.join(root, "work");
  const cliPath = path.join(codeRoot, "dist", "clawsweeper.js");
  const artifactDir = path.join(workRoot, "artifacts", "event");
  const outputPath = path.join(workRoot, "github-output");
  const batchPath = path.join(workRoot, "batch.json");
  const callsPath = path.join(workRoot, "calls.jsonl");
  fs.mkdirSync(path.dirname(cliPath), { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, "42.md"), eventReport());
  fs.writeFileSync(cliPath, fakeCli(), { mode: 0o755 });

  try {
    const result = spawnSync(
      process.execPath,
      [path.resolve("dist/repair/publish-event-result.js")],
      {
        cwd: workRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          CLAWSWEEPER_CODE_ROOT: codeRoot,
          EXACT_EVENT_PUBLICATION: "true",
          EXACT_REVIEW_BATCH_MUTATION_OUTPUT: batchPath,
          EXACT_REVIEW_WORK_ROOT: workRoot,
          GITHUB_OUTPUT: outputPath,
          ITEM_NUMBER: "42",
          TARGET_REPO: "openclaw/openclaw",
          TEST_CALLS_PATH: callsPath,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(batchPath, "utf8")), {
      kind: "superseded",
      disposition: { requeueLatestExpected: false },
    });
    assert.match(fs.readFileSync(outputPath, "utf8"), /^completion_kind=superseded$/m);
    assert.match(fs.readFileSync(outputPath, "utf8"), /^reason_code=remote_newer_tuple$/m);
    assert.deepEqual(
      fs
        .readFileSync(callsPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).command),
      ["apply-artifacts", "apply-decisions"],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function eventReport(): string {
  return [
    "---",
    "number: 42",
    "repository: openclaw/openclaw",
    "type: issue",
    "review_status: complete",
    "decision: keep_open",
    "action_taken: kept_open",
    "reviewed_at: 2026-08-25T00:00:00.000Z",
    "---",
    "",
    "# Superseded publication proof",
    "",
  ].join("\n");
}

function fakeCli(): string {
  return `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const command = args[0];
const value = (flag) => args[args.indexOf(flag) + 1];
fs.appendFileSync(process.env.TEST_CALLS_PATH, JSON.stringify({ command, args }) + "\\n");
if (command === "apply-artifacts") {
  const itemsDir = value("--items-dir");
  fs.mkdirSync(itemsDir, { recursive: true });
  fs.copyFileSync(path.join(value("--artifact-dir"), "42.md"), path.join(itemsDir, "42.md"));
} else if (command === "apply-decisions") {
  fs.mkdirSync(path.dirname(value("--report-path")), { recursive: true });
  fs.writeFileSync(
    value("--report-path"),
    JSON.stringify([{
      number: 42,
      action: "skipped_stale_review_comment_sync",
      reason: "live durable review tuple is newer",
      newerReviewTupleVerified: true
    }]) + "\\n"
  );
} else {
  process.exitCode = 97;
}
`;
}
