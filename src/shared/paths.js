const os = require("node:os");
const path = require("node:path");

function appRoot() {
  return path.resolve(__dirname, "..", "..");
}

function appHome() {
  return process.env.CLAUDEPET_HOME || process.env.CCPET_HOME || path.join(os.homedir(), ".claudepet");
}

function claudeHome() {
  return process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");
}

function runtimePath() {
  return path.join(appHome(), "runtime.json");
}

function configPath() {
  return path.join(appHome(), "config.json");
}

function statePath() {
  return path.join(appHome(), "state.json");
}

function usagePath() {
  return path.join(appHome(), "usage.json");
}

function cliScript() {
  return path.join(appRoot(), "bin", "claudepet.js");
}

function quoteCommandArg(value) {
  const text = String(value);
  if (process.platform === "win32") {
    return `"${text.replace(/"/g, '\\"')}"`;
  }
  return `'${text.replace(/'/g, "'\\''")}'`;
}

function buildNodeCommand(args = []) {
  return [process.execPath, cliScript(), ...args].map(quoteCommandArg).join(" ");
}

module.exports = {
  appRoot,
  appHome,
  claudeHome,
  runtimePath,
  configPath,
  statePath,
  usagePath,
  cliScript,
  quoteCommandArg,
  buildNodeCommand
};
