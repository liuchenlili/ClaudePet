const fs = require("node:fs");
const path = require("node:path");
const { claudeHome, buildNodeCommand } = require("./paths");
const { ensureDir, readJson, writeJson } = require("./json-file");
const { loadConfig, saveConfig } = require("./config");

const HOOK_EVENTS = {
  UserPromptSubmit: null,
  PermissionRequest: "",
  Notification: "permission_prompt|idle_prompt|elicitation_dialog",
  PreToolUse: "",
  PostToolUse: "",
  PostToolUseFailure: "",
  PostToolBatch: null,
  SubagentStart: "",
  SubagentStop: "",
  TaskCreated: null,
  TaskCompleted: null,
  Stop: null,
  StopFailure: "",
  PreCompact: "",
  PostCompact: ""
};

function settingsPathForScope(scope, cwd = process.cwd()) {
  if (scope === "user") return path.join(claudeHome(), "settings.json");
  if (scope === "project") return path.join(cwd, ".claude", "settings.json");
  return path.join(cwd, ".claude", "settings.local.json");
}

function isClaudepetCommand(command) {
  return typeof command === "string" && command.includes("claudepet.js");
}

function commandHook(command) {
  return {
    type: "command",
    command,
    async: true,
    timeout: 5
  };
}

function hasCcpetHook(entry) {
  return Boolean(
    entry &&
      Array.isArray(entry.hooks) &&
      entry.hooks.some((hook) => hook && hook.type === "command" && isClaudepetCommand(hook.command))
  );
}

function buildHookEntry(matcher, command) {
  const entry = { hooks: [commandHook(command)] };
  if (matcher !== null) entry.matcher = matcher;
  return entry;
}

function mergeHooks(settings, hookCommand) {
  const hooks = { ...(settings.hooks || {}) };
  for (const [event, matcher] of Object.entries(HOOK_EVENTS)) {
    const existing = Array.isArray(hooks[event]) ? hooks[event].slice() : [];
    if (!existing.some(hasCcpetHook)) existing.push(buildHookEntry(matcher, hookCommand));
    hooks[event] = existing;
  }
  return hooks;
}

function removeCcpetHooks(settings) {
  const hooks = { ...(settings.hooks || {}) };
  for (const event of Object.keys(hooks)) {
    if (!Array.isArray(hooks[event])) continue;
    hooks[event] = hooks[event]
      .map((entry) => ({
        ...entry,
        hooks: Array.isArray(entry.hooks) ? entry.hooks.filter((hook) => !isClaudepetCommand(hook.command)) : []
      }))
      .filter((entry) => entry.hooks.length > 0);
    if (hooks[event].length === 0) delete hooks[event];
  }
  return hooks;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupSettings(file, scope) {
  if (!fs.existsSync(file)) return null;
  const backup = `${file}.claudepet-backup-${timestamp()}`;
  fs.copyFileSync(file, backup);
  const config = loadConfig();
  saveConfig({ installBackups: { ...(config.installBackups || {}), [scope]: backup } });
  return backup;
}

function effectiveLegacyStatusLine(scope, targetSettings) {
  if (targetSettings.statusLine && !isClaudepetCommand(targetSettings.statusLine.command)) {
    return targetSettings.statusLine;
  }
  if (scope !== "user") {
    const userSettings = readJson(path.join(claudeHome(), "settings.json"), {});
    if (userSettings && userSettings.statusLine && !isClaudepetCommand(userSettings.statusLine.command)) {
      return userSettings.statusLine;
    }
  }
  return null;
}

function installSettings(options = {}) {
  const scope = options.scope || "local";
  const cwd = options.cwd || process.cwd();
  const settingsFile = settingsPathForScope(scope, cwd);
  ensureDir(path.dirname(settingsFile));
  const settings = readJson(settingsFile, {}) || {};
  const backupPath = backupSettings(settingsFile, scope);
  const statuslineCommand = buildNodeCommand(["statusline"]);
  const hookCommand = buildNodeCommand(["hook"]);

  if (options.preserveStatusLine) {
    const legacy = effectiveLegacyStatusLine(scope, settings);
    if (legacy) saveConfig({ legacyStatusLine: legacy });
  }

  const next = {
    ...settings,
    statusLine: {
      ...(settings.statusLine || {}),
      type: "command",
      command: statuslineCommand,
      refreshInterval: Number((settings.statusLine && settings.statusLine.refreshInterval) || 2)
    },
    hooks: mergeHooks(settings, hookCommand)
  };

  writeJson(settingsFile, next);
  return {
    scope,
    settingsFile,
    backupPath,
    statuslineCommand,
    hookCommand
  };
}

function uninstallSettings(options = {}) {
  const scope = options.scope || "local";
  const cwd = options.cwd || process.cwd();
  const settingsFile = settingsPathForScope(scope, cwd);
  const settings = readJson(settingsFile, {}) || {};
  const config = loadConfig();
  const next = { ...settings };

  if (next.statusLine && isClaudepetCommand(next.statusLine.command)) {
    if (scope === "user" && config.legacyStatusLine) next.statusLine = config.legacyStatusLine;
    else delete next.statusLine;
  }
  next.hooks = removeCcpetHooks(next);
  if (Object.keys(next.hooks).length === 0) delete next.hooks;
  writeJson(settingsFile, next);
  return { scope, settingsFile };
}

module.exports = {
  HOOK_EVENTS,
  installSettings,
  isClaudepetCommand,
  mergeHooks,
  removeCcpetHooks,
  settingsPathForScope,
  uninstallSettings
};
