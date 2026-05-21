const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { readJson } = require("../src/shared/json-file");
const { loadConfig } = require("../src/shared/config");
const { installSettings, uninstallSettings } = require("../src/shared/install");

function tempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "claudepet-install-"));
  const cwd = path.join(root, "project");
  const claude = path.join(root, "claude");
  const home = path.join(root, "claudepet");
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(claude, { recursive: true });
  process.env.CLAUDE_HOME = claude;
  process.env.CLAUDEPET_HOME = home;
  return { root, cwd, claude, home };
}

test("local install writes settings.local and preserves existing user statusLine", () => {
  const env = tempEnv();
  fs.writeFileSync(
    path.join(env.claude, "settings.json"),
    JSON.stringify({ statusLine: { type: "command", command: '"node" "legacy-hud.js"' } }, null, 2),
    "utf8"
  );

  const result = installSettings({ scope: "local", cwd: env.cwd, preserveStatusLine: true });
  const settings = readJson(result.settingsFile);
  const config = loadConfig();
  const permissionHook = settings.hooks.PermissionRequest[0].hooks[0];
  const toolHook = settings.hooks.PreToolUse[0].hooks[0];

  assert.equal(path.basename(result.settingsFile), "settings.local.json");
  assert.match(settings.statusLine.command, /claudepet\.js['"]?\s+['"]?statusline/);
  assert.ok(settings.hooks.PermissionRequest.length > 0);
  assert.equal(permissionHook.async, false);
  assert.equal(permissionHook.timeout, 300);
  assert.equal(toolHook.async, true);
  assert.equal(toolHook.timeout, 5);
  assert.equal(config.legacyStatusLine.command, '"node" "legacy-hud.js"');
});

test("reinstall migrates existing async permission hook", () => {
  const env = tempEnv();
  const settingsFile = path.join(env.cwd, ".claude", "settings.local.json");
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  fs.writeFileSync(
    settingsFile,
    JSON.stringify({
      hooks: {
        PermissionRequest: [
          {
            matcher: "",
            hooks: [
              { type: "command", command: '"node" "/tmp/bin/claudepet.js" "hook"', async: true, timeout: 5 }
            ]
          }
        ]
      }
    }, null, 2),
    "utf8"
  );

  const result = installSettings({ scope: "local", cwd: env.cwd, preserveStatusLine: false });
  const settings = readJson(result.settingsFile);
  const hook = settings.hooks.PermissionRequest[0].hooks[0];

  assert.equal(settings.hooks.PermissionRequest.length, 1);
  assert.equal(hook.async, false);
  assert.equal(hook.timeout, 300);
});

test("uninstall removes claudepet hooks and local statusLine", () => {
  const env = tempEnv();
  installSettings({ scope: "local", cwd: env.cwd, preserveStatusLine: false });
  const result = uninstallSettings({ scope: "local", cwd: env.cwd });
  const settings = readJson(result.settingsFile);

  assert.equal(settings.statusLine, undefined);
  assert.equal(settings.hooks, undefined);
});
