const { spawn } = require("node:child_process");
const { loadConfig } = require("./shared/config");
const { installSettings, uninstallSettings } = require("./shared/install");
const { listPets } = require("./shared/pets");
const { buildStatusLineState, formatFallbackStatusLine, statusFromHook } = require("./shared/state");
const { saveRuntimeState, loadRuntimeState, appendHistory } = require("./shared/runtime-state");
const { sendEventWithLaunch, resolveElectronBinary, readRuntime, launchApp } = require("./shared/bridge-client");
const { appHome, claudeHome, configPath, runtimePath, statePath } = require("./shared/paths");

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
  });
}

function parseJson(text) {
  if (!text || !text.trim()) return {};
  return JSON.parse(text);
}

function runLegacyStatusLine(command, input, timeoutMs = 2200) {
  return new Promise((resolve) => {
    if (!command) return resolve(null);
    const child = spawn(command, [], {
      shell: true,
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true
    });
    let stdout = "";
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill();
      resolve(null);
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(stdout || null);
    });
    child.stdin.end(input);
  });
}

function mergeStatePatch(patch) {
  const current = loadRuntimeState();
  const next = {
    ...current,
    ...patch,
    status: patch.status || current.status,
    history: patch.status ? appendHistory(current, patch.status) : current.history
  };
  saveRuntimeState(next);
  return next;
}

async function statusLineCommand() {
  const raw = await readStdin();
  let parsed = {};
  let state;
  try {
    parsed = parseJson(raw);
    state = buildStatusLineState(parsed);
  } catch (error) {
    state = buildStatusLineState({});
    state.status = {
      kind: "error",
      label: "claudepet could not parse statusLine JSON",
      detail: String(error.message || error),
      severity: "error",
      attention: false,
      animation: "error",
      updatedAt: new Date().toISOString()
    };
  }
  mergeStatePatch(state);
  await sendEventWithLaunch({ type: "statusline", raw: parsed, state, receivedAt: new Date().toISOString() });

  const config = loadConfig();
  const legacyCommand = config.legacyStatusLine && config.legacyStatusLine.command;
  const legacyOutput = legacyCommand ? await runLegacyStatusLine(legacyCommand, raw) : null;
  process.stdout.write(legacyOutput || `${formatFallbackStatusLine(state)}\n`);
}

async function hookCommand() {
  const raw = await readStdin();
  const parsed = parseJson(raw);
  const status = statusFromHook(parsed);
  mergeStatePatch({ status });
  await sendEventWithLaunch({ type: "hook", raw: parsed, status, receivedAt: new Date().toISOString() });
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      flags._.push(item);
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      index += 1;
    }
  }
  return flags;
}

function printInstallResult(result) {
  process.stdout.write(`claudepet installed for ${result.scope}\n`);
  process.stdout.write(`settings: ${result.settingsFile}\n`);
  if (result.backupPath) process.stdout.write(`backup: ${result.backupPath}\n`);
  process.stdout.write(`statusLine: ${result.statuslineCommand}\n`);
}

function printDoctor() {
  const runtime = readRuntime();
  const electron = resolveElectronBinary();
  const pets = listPets();
  process.stdout.write(`claudepet home: ${appHome()}\n`);
  process.stdout.write(`Claude home: ${claudeHome()}\n`);
  process.stdout.write(`config: ${configPath()}\n`);
  process.stdout.write(`state: ${statePath()}\n`);
  process.stdout.write(`runtime: ${runtimePath()}${runtime ? ` (${runtime.port})` : " (not running)"}\n`);
  process.stdout.write(`Electron: ${electron || "not installed"}\n`);
  process.stdout.write(`Pets: ${pets.map((pet) => pet.id).join(", ") || "none"}\n`);
}

function printHelp() {
  process.stdout.write(`claudepet commands

  claudepet statusline              Claude Code statusLine bridge
  claudepet hook                    Claude Code hooks bridge
  claudepet install --scope local   Install current project .claude/settings.local.json
  claudepet install --scope user    Install global ~/.claude/settings.json
  claudepet uninstall --scope local Remove current project integration
  claudepet start                   Launch the desktop pet
  claudepet pets                    List available pets
  claudepet doctor                  Show runtime diagnostics
`);
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  switch (command) {
    case "statusline":
      return statusLineCommand();
    case "hook":
      return hookCommand();
    case "install":
      return printInstallResult(
        installSettings({
          scope: flags.scope || "local",
          cwd: process.cwd(),
          preserveStatusLine: Boolean(flags["preserve-statusline"])
        })
      );
    case "uninstall": {
      const result = uninstallSettings({ scope: flags.scope || "local", cwd: process.cwd() });
      process.stdout.write(`claudepet uninstalled for ${result.scope}\nsettings: ${result.settingsFile}\n`);
      return;
    }
    case "start": {
      if (!launchApp()) {
        process.stderr.write("Electron is not installed. Run npm install first.\n");
        process.exitCode = 1;
      }
      return;
    }
    case "pets": {
      for (const pet of listPets()) {
        process.stdout.write(`${pet.id}\t${pet.displayName}\t${pet.columns}x${pet.rows} frames\n`);
      }
      return;
    }
    case "doctor":
      return printDoctor();
    case undefined:
    case "-h":
    case "--help":
      return printHelp();
    default:
      process.stderr.write(`Unknown command: ${command}\n\n`);
      printHelp();
      process.exitCode = 1;
  }
}

module.exports = {
  main,
  runLegacyStatusLine
};
