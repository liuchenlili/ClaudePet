const fs = require("node:fs");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { runtimePath, appRoot } = require("./paths");
const { readJson } = require("./json-file");

function readRuntime() {
  return readJson(runtimePath(), null);
}

function readResponseBody(response) {
  return new Promise((resolve, reject) => {
    let body = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => {
      body += chunk;
    });
    response.on("end", () => resolve(body));
    response.on("error", reject);
  });
}

function postJsonForResponse(port, token, route, payload, timeoutMs = 500) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: route,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          authorization: `Bearer ${token}`
        },
        timeout: timeoutMs
      },
      async (response) => {
        try {
          const responseBody = await readResponseBody(response);
          if (response.statusCode < 200 || response.statusCode >= 300) return resolve(null);
          if (!responseBody) return resolve({});
          resolve(JSON.parse(responseBody));
        } catch (error) {
          reject(error);
        }
      }
    );
    request.on("timeout", () => {
      request.destroy(new Error("bridge timeout"));
    });
    request.on("error", reject);
    request.end(body);
  });
}

function postJson(port, token, route, payload, timeoutMs = 500) {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: route,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
          authorization: `Bearer ${token}`
        },
        timeout: timeoutMs
      },
      (response) => {
        response.resume();
        response.on("end", () => resolve(response.statusCode >= 200 && response.statusCode < 300));
      }
    );
    request.on("timeout", () => {
      request.destroy(new Error("bridge timeout"));
    });
    request.on("error", reject);
    request.end(body);
  });
}

async function sendEvent(payload, options = {}) {
  const runtime = readRuntime();
  if (!runtime || !runtime.port || !runtime.token) return false;
  try {
    return await postJson(runtime.port, runtime.token, "/event", payload, options.timeoutMs || 500);
  } catch {
    return false;
  }
}

function resolveElectronBinary() {
  if (process.env.CLAUDEPET_ELECTRON_PATH && fs.existsSync(process.env.CLAUDEPET_ELECTRON_PATH)) {
    return process.env.CLAUDEPET_ELECTRON_PATH;
  }
  try {
    const electronPath = require("electron");
    if (typeof electronPath === "string" && fs.existsSync(electronPath)) return electronPath;
  } catch {
    // Electron is optional for tests and CLI-only use.
  }
  return null;
}

function launchApp() {
  const electron = resolveElectronBinary();
  if (!electron) return false;
  const child = spawn(electron, [appRoot(), "--background"], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return true;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendEventWithLaunch(payload) {
  if (await sendEvent(payload)) return true;
  if (process.env.CLAUDEPET_NO_AUTO_LAUNCH === "1") return false;
  if (!launchApp()) return false;
  await delay(650);
  return sendEvent(payload, { timeoutMs: 700 });
}

async function requestPermissionDecision(payload, options = {}) {
  const runtime = readRuntime();
  if (!runtime || !runtime.port || !runtime.token) return null;
  try {
    return await postJsonForResponse(runtime.port, runtime.token, "/permission-request", payload, options.timeoutMs || 295000);
  } catch {
    return null;
  }
}

async function requestPermissionDecisionWithLaunch(payload, options = {}) {
  const first = await requestPermissionDecision(payload, options);
  if (first) return first;
  if (process.env.CLAUDEPET_NO_AUTO_LAUNCH === "1") return null;
  if (!launchApp()) return null;
  await delay(650);
  return requestPermissionDecision(payload, options);
}

async function sendPermissionClear(payload, options = {}) {
  const runtime = readRuntime();
  if (!runtime || !runtime.port || !runtime.token) return false;
  try {
    return await postJson(runtime.port, runtime.token, "/permission-clear", payload, options.timeoutMs || 500);
  } catch {
    return false;
  }
}

async function sendPermissionClearWithLaunch(payload) {
  if (await sendPermissionClear(payload)) return true;
  if (process.env.CLAUDEPET_NO_AUTO_LAUNCH === "1") return false;
  if (!launchApp()) return false;
  await delay(650);
  return sendPermissionClear(payload, { timeoutMs: 700 });
}

module.exports = {
  launchApp,
  readRuntime,
  requestPermissionDecision,
  requestPermissionDecisionWithLaunch,
  resolveElectronBinary,
  sendEvent,
  sendEventWithLaunch,
  sendPermissionClear,
  sendPermissionClearWithLaunch
};
