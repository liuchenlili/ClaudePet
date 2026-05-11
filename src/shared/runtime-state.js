const { readJson, writeJson, mergeDeep } = require("./json-file");
const { statePath } = require("./paths");

const DEFAULT_SESSION_ID = "__default__";

const DEFAULT_SESSION_STATE = {
  updatedAt: null,
  lastEventAt: null,
  session: {},
  cost: {},
  context: {},
  tokens: {},
  git: { isRepo: false },
  rateLimits: null,
  status: {
    kind: "idle",
    label: "Claude Code is ready",
    detail: "",
    severity: "info",
    attention: false,
    animation: "idle",
    updatedAt: null
  },
  tasks: {},
  history: [],
  activeSubagent: null
};

const LEGACY_STATE_KEYS = [
  "updatedAt",
  "session",
  "cost",
  "context",
  "tokens",
  "git",
  "rateLimits",
  "status",
  "tasks",
  "history",
  "activeSubagent"
];

function emptyFile() {
  return { updatedAt: null, sessions: {} };
}

function hasLegacyShape(raw) {
  if (!raw || typeof raw !== "object") return false;
  if (raw.sessions && typeof raw.sessions === "object") return false;
  return LEGACY_STATE_KEYS.some((key) => key in raw);
}

function readStateFile() {
  const raw = readJson(statePath(), null);
  if (!raw || typeof raw !== "object") return emptyFile();
  if (hasLegacyShape(raw)) {
    const sessions = {};
    sessions[DEFAULT_SESSION_ID] = mergeDeep(DEFAULT_SESSION_STATE, raw);
    return { updatedAt: raw.updatedAt || null, sessions };
  }
  const sessions = raw.sessions && typeof raw.sessions === "object" ? raw.sessions : {};
  return { updatedAt: raw.updatedAt || null, sessions };
}

function writeStateFile(file) {
  writeJson(statePath(), file);
}

function resolveSessionId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return id || DEFAULT_SESSION_ID;
}

function loadSessionState(sessionId) {
  const file = readStateFile();
  const id = resolveSessionId(sessionId);
  return mergeDeep(DEFAULT_SESSION_STATE, file.sessions[id] || {});
}

function saveSessionState(sessionId, state) {
  const file = readStateFile();
  const id = resolveSessionId(sessionId);
  const merged = mergeDeep(DEFAULT_SESSION_STATE, state || {});
  merged.lastEventAt = new Date().toISOString();
  file.sessions[id] = merged;
  file.updatedAt = merged.lastEventAt;
  writeStateFile(file);
  return merged;
}

function listSessions() {
  const file = readStateFile();
  return Object.entries(file.sessions).map(([sessionId, state]) => ({
    sessionId,
    state: mergeDeep(DEFAULT_SESSION_STATE, state || {})
  }));
}

function removeSession(sessionId) {
  const file = readStateFile();
  const id = resolveSessionId(sessionId);
  if (!(id in file.sessions)) return false;
  delete file.sessions[id];
  file.updatedAt = new Date().toISOString();
  writeStateFile(file);
  return true;
}

function pruneStaleSessions(maxAgeMs) {
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return [];
  const file = readStateFile();
  const cutoff = Date.now() - maxAgeMs;
  const removed = [];
  for (const [id, state] of Object.entries(file.sessions)) {
    const last = Date.parse(state && state.lastEventAt ? state.lastEventAt : 0);
    if (!Number.isFinite(last) || last < cutoff) {
      removed.push(id);
      delete file.sessions[id];
    }
  }
  if (removed.length) {
    file.updatedAt = new Date().toISOString();
    writeStateFile(file);
  }
  return removed;
}

function appendHistory(state, status) {
  const history = Array.isArray(state.history) ? state.history.slice(-39) : [];
  if (status) history.push(status);
  return history;
}

function loadRuntimeState() {
  return loadSessionState(DEFAULT_SESSION_ID);
}

function saveRuntimeState(state) {
  return saveSessionState(DEFAULT_SESSION_ID, state);
}

module.exports = {
  DEFAULT_SESSION_ID,
  DEFAULT_SESSION_STATE,
  DEFAULT_STATE: DEFAULT_SESSION_STATE,
  appendHistory,
  listSessions,
  loadRuntimeState,
  loadSessionState,
  pruneStaleSessions,
  removeSession,
  resolveSessionId,
  saveRuntimeState,
  saveSessionState
};
