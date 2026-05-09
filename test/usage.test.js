const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

function withTempHome(name, fn) {
  return async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `claudepet-${name}-`));
    const original = process.env.CLAUDEPET_HOME;
    process.env.CLAUDEPET_HOME = dir;
    delete require.cache[require.resolve("../src/shared/paths")];
    delete require.cache[require.resolve("../src/shared/usage")];
    try {
      const usage = require("../src/shared/usage");
      await fn(usage, dir);
    } finally {
      if (original === undefined) delete process.env.CLAUDEPET_HOME;
      else process.env.CLAUDEPET_HOME = original;
      delete require.cache[require.resolve("../src/shared/paths")];
      delete require.cache[require.resolve("../src/shared/usage")];
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  "recordSnapshot computes deltas from cumulative session totals",
  withTempHome("delta", (usage) => {
    const t0 = new Date("2026-05-09T10:00:00Z");
    const first = usage.recordSnapshot({
      sessionId: "s1",
      projectKey: "proj",
      model: "claude-sonnet-4-6",
      snapshot: { input: 1000, output: 200, cacheCreation: 50, cacheRead: 30, cost: 0.05, durationMs: 60000 },
      now: t0
    });
    assert.deepEqual(first, { input: 1000, output: 200, cacheCreation: 50, cacheRead: 30, cost: 0.05, durationMs: 60000 });

    const second = usage.recordSnapshot({
      sessionId: "s1",
      projectKey: "proj",
      model: "claude-sonnet-4-6",
      snapshot: { input: 1500, output: 350, cacheCreation: 50, cacheRead: 80, cost: 0.09, durationMs: 90000 },
      now: t0
    });
    assert.equal(second.input, 500);
    assert.equal(second.output, 150);
    assert.equal(second.cacheCreation, 0);
    assert.equal(second.cacheRead, 50);
    assert.ok(Math.abs(second.cost - 0.04) < 1e-9);
    assert.equal(second.durationMs, 30000);

    const stats = usage.getStats({ rangeDays: 1, now: t0 });
    assert.equal(stats.total.input, 1500);
    assert.equal(stats.total.output, 350);
    assert.equal(stats.total.sessions, 1);
    assert.equal(stats.byProject.length, 1);
    assert.equal(stats.byProject[0].projectKey, "proj");
  })
);

test(
  "recordSnapshot keeps per-day, per-project buckets and aggregates correctly",
  withTempHome("buckets", (usage) => {
    const day1 = new Date("2026-05-08T12:00:00Z");
    const day2 = new Date("2026-05-09T12:00:00Z");
    usage.recordSnapshot({ sessionId: "a", projectKey: "alpha", snapshot: { input: 100, output: 10, cacheCreation: 0, cacheRead: 0, cost: 0.01, durationMs: 1000 }, now: day1 });
    usage.recordSnapshot({ sessionId: "b", projectKey: "beta", snapshot: { input: 200, output: 20, cacheCreation: 0, cacheRead: 0, cost: 0.02, durationMs: 2000 }, now: day1 });
    usage.recordSnapshot({ sessionId: "a", projectKey: "alpha", snapshot: { input: 300, output: 40, cacheCreation: 0, cacheRead: 0, cost: 0.05, durationMs: 5000 }, now: day2 });

    const all = usage.getStats({ rangeDays: 0, now: day2 });
    // day1 alpha=100, beta=200; day2 alpha delta=200 -> total = 500
    assert.equal(all.total.input, 500);
    assert.equal(all.total.output, 60);
    assert.equal(all.byProject.length, 2);
    const alpha = all.byProject.find((p) => p.projectKey === "alpha");
    assert.equal(alpha.input, 100 + 200);
    assert.equal(alpha.output, 10 + 30);

    const todayOnly = usage.getStats({ rangeDays: 1, now: day2 });
    assert.equal(todayOnly.total.input, 200);
    assert.equal(todayOnly.byDay.length, 1);
    assert.equal(todayOnly.byDay[0].dateKey, "2026-05-09");
  })
);

test(
  "pruneOldData removes daily buckets and sessions past retention window",
  withTempHome("prune", (usage) => {
    const old = new Date("2026-01-01T12:00:00Z");
    const recent = new Date("2026-05-09T12:00:00Z");
    usage.recordSnapshot({ sessionId: "old", projectKey: "x", snapshot: { input: 10, output: 2, cacheCreation: 0, cacheRead: 0, cost: 0.001, durationMs: 100 }, now: old });
    usage.recordSnapshot({ sessionId: "new", projectKey: "x", snapshot: { input: 20, output: 4, cacheCreation: 0, cacheRead: 0, cost: 0.002, durationMs: 200 }, now: recent });
    const removed = usage.pruneOldData(7, recent);
    assert.ok(removed >= 2);
    const data = usage.loadUsage();
    assert.equal(Object.keys(data.daily).length, 1);
    assert.ok(!data.sessions.old);
    assert.ok(data.sessions.new);
  })
);

test(
  "projectKeyFrom returns last directory segment",
  withTempHome("projectkey", (usage) => {
    assert.equal(usage.projectKeyFrom({ workspace: { project_dir: "C:\\Users\\me\\proj-a" } }), "proj-a");
    assert.equal(usage.projectKeyFrom({ workspace: { current_dir: "/home/me/proj-b/" } }), "proj-b");
    assert.equal(usage.projectKeyFrom({ cwd: "/tmp/proj-c/" }), "proj-c");
    assert.equal(usage.projectKeyFrom({}), "unknown");
  })
);

test(
  "snapshotFromState pulls cumulative values from the broadcast state",
  withTempHome("from-state", (usage) => {
    const snap = usage.snapshotFromState({
      tokens: { sessionInput: 1234, sessionOutput: 56, sessionCacheCreation: 7, sessionCacheRead: 8 },
      cost: { totalCostUsd: 0.123, totalDurationMs: 4567 }
    });
    assert.equal(snap.input, 1234);
    assert.equal(snap.output, 56);
    assert.equal(snap.cacheCreation, 7);
    assert.equal(snap.cacheRead, 8);
    assert.equal(snap.cost, 0.123);
    assert.equal(snap.durationMs, 4567);
  })
);
