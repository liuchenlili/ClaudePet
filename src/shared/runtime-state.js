const { readJson, writeJson, mergeDeep } = require("./json-file");
const { statePath } = require("./paths");

const DEFAULT_STATE = {
  updatedAt: null,
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

function loadRuntimeState() {
  return mergeDeep(DEFAULT_STATE, readJson(statePath(), {}) || {});
}

function saveRuntimeState(state) {
  writeJson(statePath(), mergeDeep(DEFAULT_STATE, state || {}));
}

function appendHistory(state, status) {
  const history = Array.isArray(state.history) ? state.history.slice(-39) : [];
  if (status) history.push(status);
  return history;
}

module.exports = {
  DEFAULT_STATE,
  loadRuntimeState,
  saveRuntimeState,
  appendHistory
};
