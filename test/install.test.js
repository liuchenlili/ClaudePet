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

  assert.equal(path.basename(result.settingsFile), "settings.local.json");
  assert.match(settings.statusLine.command, /claudepet\.js" "statusline"/);
  assert.ok(settings.hooks.PermissionRequest.length > 0);
  assert.equal(config.legacyStatusLine.command, '"node" "legacy-hud.js"');
});

test("uninstall removes claudepet hooks and local statusLine", () => {
  const env = tempEnv();
  installSettings({ scope: "local", cwd: env.cwd, preserveStatusLine: false });
  const result = uninstallSettings({ scope: "local", cwd: env.cwd });
  const settings = readJson(result.settingsFile);

  assert.equal(settings.statusLine, undefined);
  assert.equal(settings.hooks, undefined);
});
