const path = require("node:path");
const { usagePath } = require("./paths");
const { readJson, writeJson, ensureDir } = require("./json-file");

const SCHEMA_VERSION = 1;
const TOKEN_KEYS = ["input", "output", "cacheCreation", "cacheRead"];
const ALL_KEYS = [...TOKEN_KEYS, "cost", "durationMs"];

function emptyUsage() {
  return { schemaVersion: SCHEMA_VERSION, sessions: {}, daily: {} };
}

function loadUsage() {
  const data = readJson(usagePath(), null) || emptyUsage();
  if (!data.schemaVersion) data.schemaVersion = SCHEMA_VERSION;
  data.sessions = data.sessions || {};
  data.daily = data.daily || {};
  return data;
}

function saveUsage(data) {
  ensureDir(path.dirname(usagePath()));
  writeJson(usagePath(), data);
}

function todayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function projectKeyFrom(input) {
  const candidates = [
    input.workspace && input.workspace.project_dir,
    input.workspace && input.workspace.current_dir,
    input.cwd
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      const name = path.basename(candidate.replace(/[\\/]+$/, ""));
      if (name) return name;
    }
  }
  return "unknown";
}

function readSnapshot(input) {
  const tokens = (input && input.context_window) || {};
  const usage = tokens.session_usage || tokens.usage || tokens.totals || {};
  const cost = (input && input.cost) || {};
  const transcriptInput = Number(input.session_input_tokens || 0);
  const transcriptOutput = Number(input.session_output_tokens || 0);
  return {
    input: Number(usage.input_tokens || tokens.total_input_tokens || transcriptInput || 0),
    output: Number(usage.output_tokens || tokens.total_output_tokens || transcriptOutput || 0),
    cacheCreation: Number(usage.cache_creation_input_tokens || 0),
    cacheRead: Number(usage.cache_read_input_tokens || 0),
    cost: Number(cost.total_cost_usd || 0),
    durationMs: Number(cost.total_duration_ms || 0)
  };
}

function snapshotFromState(state) {
  if (!state) return null;
  const tokens = state.tokens || {};
  const cost = state.cost || {};
  return {
    input: Number(tokens.sessionInput ?? tokens.liveInput ?? 0),
    output: Number(tokens.sessionOutput ?? tokens.liveOutput ?? 0),
    cacheCreation: Number(tokens.sessionCacheCreation ?? 0),
    cacheRead: Number(tokens.sessionCacheRead ?? 0),
    cost: Number(cost.totalCostUsd || 0),
    durationMs: Number(cost.totalDurationMs || 0)
  };
}

function diffSnapshot(current, previous) {
  const result = {};
  let any = false;
  for (const key of ALL_KEYS) {
    const cur = Number(current[key] || 0);
    const prev = Number(previous && previous[key] ? previous[key] : 0);
    // If transcript was rotated/truncated, current can be smaller than previous;
    // count current as the increment in that case to avoid losing data.
    const delta = cur >= prev ? cur - prev : cur;
    result[key] = delta;
    if (delta > 0) any = true;
  }
  return any ? result : null;
}

function ensureDailyBucket(daily, dateKey, projectKey) {
  if (!daily[dateKey]) daily[dateKey] = {};
  if (!daily[dateKey][projectKey]) {
    daily[dateKey][projectKey] = {
      input: 0,
      output: 0,
      cacheCreation: 0,
      cacheRead: 0,
      cost: 0,
      durationMs: 0,
      sessions: {}
    };
  }
  return daily[dateKey][projectKey];
}

function applyDelta(bucket, delta, sessionId) {
  for (const key of ALL_KEYS) {
    bucket[key] = Number(bucket[key] || 0) + Number(delta[key] || 0);
  }
  if (sessionId) bucket.sessions[sessionId] = true;
}

function recordSnapshot({ sessionId, projectKey, model, snapshot, now = new Date() }) {
  if (!sessionId || !snapshot) return null;
  const data = loadUsage();
  const session = data.sessions[sessionId] || null;
  const previous = session && session.lastSnapshot;
  const delta = diffSnapshot(snapshot, previous);
  const isoNow = now.toISOString();

  data.sessions[sessionId] = {
    projectKey: projectKey || (session && session.projectKey) || "unknown",
    model: model || (session && session.model) || "",
    firstSeenAt: session ? session.firstSeenAt : isoNow,
    lastSeenAt: isoNow,
    lastSnapshot: { ...snapshot }
  };

  if (delta) {
    const dateKey = todayKey(now);
    const key = projectKey || "unknown";
    const bucket = ensureDailyBucket(data.daily, dateKey, key);
    applyDelta(bucket, delta, sessionId);
  }

  saveUsage(data);
  return delta;
}

function pruneOldData(retentionDays, now = new Date()) {
  if (!retentionDays || retentionDays <= 0) return null;
  const data = loadUsage();
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoffKey = todayKey(cutoff);
  let removed = 0;
  for (const key of Object.keys(data.daily)) {
    if (key < cutoffKey) {
      delete data.daily[key];
      removed += 1;
    }
  }
  const cutoffMs = cutoff.getTime();
  for (const id of Object.keys(data.sessions)) {
    const lastSeen = Date.parse(data.sessions[id].lastSeenAt || 0);
    if (Number.isFinite(lastSeen) && lastSeen < cutoffMs) {
      delete data.sessions[id];
      removed += 1;
    }
  }
  if (removed > 0) saveUsage(data);
  return removed;
}

function aggregate(buckets) {
  const total = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0, cost: 0, durationMs: 0, sessions: 0 };
  const byProject = new Map();
  const byDay = new Map();
  for (const { dateKey, projectKey, bucket } of buckets) {
    const sessionCount = bucket.sessions ? Object.keys(bucket.sessions).length : 0;
    for (const k of ALL_KEYS) total[k] += Number(bucket[k] || 0);
    total.sessions += sessionCount;

    const projectEntry = byProject.get(projectKey) || { projectKey, input: 0, output: 0, cacheCreation: 0, cacheRead: 0, cost: 0, durationMs: 0, sessions: 0 };
    for (const k of ALL_KEYS) projectEntry[k] += Number(bucket[k] || 0);
    projectEntry.sessions += sessionCount;
    byProject.set(projectKey, projectEntry);

    const dayEntry = byDay.get(dateKey) || { dateKey, input: 0, output: 0, cacheCreation: 0, cacheRead: 0, cost: 0, durationMs: 0, sessions: 0 };
    for (const k of ALL_KEYS) dayEntry[k] += Number(bucket[k] || 0);
    dayEntry.sessions += sessionCount;
    byDay.set(dateKey, dayEntry);
  }
  return {
    total,
    byProject: Array.from(byProject.values()).sort((a, b) => b.cost - a.cost || (b.input + b.output) - (a.input + a.output)),
    byDay: Array.from(byDay.values()).sort((a, b) => (a.dateKey < b.dateKey ? 1 : -1))
  };
}

function getStats({ rangeDays = 0, now = new Date(), data } = {}) {
  const usage = data || loadUsage();
  const buckets = [];
  let cutoffKey = null;
  if (rangeDays > 0) {
    const cutoff = new Date(now.getTime() - (rangeDays - 1) * 24 * 60 * 60 * 1000);
    cutoffKey = todayKey(cutoff);
  }
  for (const dateKey of Object.keys(usage.daily)) {
    if (cutoffKey && dateKey < cutoffKey) continue;
    const projects = usage.daily[dateKey];
    for (const projectKey of Object.keys(projects)) {
      buckets.push({ dateKey, projectKey, bucket: projects[projectKey] });
    }
  }
  return aggregate(buckets);
}

function getUsageOverview({ now = new Date(), data } = {}) {
  const usage = data || loadUsage();
  return {
    today: getStats({ rangeDays: 1, now, data: usage }),
    last7: getStats({ rangeDays: 7, now, data: usage }),
    last30: getStats({ rangeDays: 30, now, data: usage }),
    all: getStats({ rangeDays: 0, now, data: usage }),
    sessionCount: Object.keys(usage.sessions).length,
    schemaVersion: usage.schemaVersion
  };
}

module.exports = {
  ALL_KEYS,
  TOKEN_KEYS,
  SCHEMA_VERSION,
  emptyUsage,
  loadUsage,
  saveUsage,
  todayKey,
  projectKeyFrom,
  readSnapshot,
  snapshotFromState,
  diffSnapshot,
  recordSnapshot,
  pruneOldData,
  getStats,
  getUsageOverview
};
