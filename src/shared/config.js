const { configPath } = require("./paths");
const { readJson, writeJson, mergeDeep, ensureDir } = require("./json-file");
const path = require("node:path");

const DEFAULT_CONFIG = {
  selectedPet: "clawd",
  scale: 0.48,
  opacity: 0.96,
  alwaysOnTop: true,
  animationFps: 8,
  showPanel: true,
  panelCompact: false,
  position: null,
  notifications: {
    system: true,
    sound: false,
    flashWindow: true
  },
  fields: {
    session: true,
    context: true,
    git: true,
    tokens: true,
    task: true,
    cost: true
  },
  legacyStatusLine: null,
  installBackups: {},
  stats: {
    enabled: true,
    retentionDays: 90
  }
};

function loadConfig() {
  const file = configPath();
  const loaded = readJson(file, {});
  const config = mergeDeep(DEFAULT_CONFIG, loaded || {});
  const loadedScale = Number(config.scale || DEFAULT_CONFIG.scale);
  config.scale = loadedScale > 1.1 ? DEFAULT_CONFIG.scale : Math.max(0.32, Math.min(1.1, loadedScale));
  config.opacity = Math.max(0.35, Math.min(1, Number(config.opacity || DEFAULT_CONFIG.opacity)));
  return config;
}

function saveConfig(patchOrConfig) {
  const next = mergeDeep(loadConfig(), patchOrConfig || {});
  ensureDir(path.dirname(configPath()));
  writeJson(configPath(), next);
  return next;
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig
};
