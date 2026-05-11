const path = require("node:path");
const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, Tray } = require("electron");
const { startBridgeServer } = require("./bridge-server");
const { loadConfig, saveConfig } = require("../shared/config");
const { listPets, savePetManifest } = require("../shared/pets");
const { loadRuntimeState, saveRuntimeState, appendHistory } = require("../shared/runtime-state");
const { recordSnapshot, snapshotFromState, projectKeyFrom, pruneOldData, getUsageOverview } = require("../shared/usage");

const APP_NAME = "ClaudePet";
const APP_USER_MODEL_ID = "com.liuchenlili.ClaudePet";

app.setName(APP_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

let petWindow = null;
let managerWindow = null;
let tray = null;
let bridge = null;
let config = loadConfig();
let state = loadRuntimeState();
let savePositionTimer = null;
let userHidden = false;

function rendererPayload() {
  return {
    state,
    config,
    pets: listPets(),
    appVersion: app.getVersion()
  };
}

function broadcast(channel = "claudepet:update") {
  const payload = rendererPayload();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload);
  }
}

function isRecentActiveStatus(status) {
  if (!status || status.kind === "idle") return false;
  const updatedAt = Date.parse(status.updatedAt || 0);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt < 30000;
}

function recordUsageFromEvent(event) {
  if (!config.stats || config.stats.enabled === false) return;
  if (event.type !== "statusline") return;
  const eventState = event.state || {};
  const sessionId = eventState.session && eventState.session.id;
  if (!sessionId) return;
  const snapshot = snapshotFromState(eventState);
  if (!snapshot) return;
  const projectKey = projectKeyFrom(event.raw || {}) || (eventState.session && eventState.session.cwdName) || "unknown";
  const model = (eventState.session && eventState.session.model && (eventState.session.model.id || eventState.session.model.display_name)) || "";
  try {
    recordSnapshot({ sessionId, projectKey, model, snapshot });
  } catch (error) {
    // Avoid breaking the bridge on stats failures.
    if (process.env.CLAUDEPET_DEBUG) console.error("[claudepet] usage record failed", error);
  }
}

function updateStateFromEvent(event) {
  if (event.type === "statusline") {
    const incoming = event.state.status || null;
    const activeStatus = isRecentActiveStatus(state.status) ? state.status : null;
    let mergedStatus;
    if (activeStatus) {
      // Keep the sticky hook kind/label/animation, but always pull the freshest
      // assistant output (detail) from the latest statusline event.
      mergedStatus = incoming && incoming.detail !== undefined
        ? { ...activeStatus, detail: incoming.detail, updatedAt: activeStatus.updatedAt }
        : activeStatus;
    } else {
      mergedStatus = incoming || state.status;
    }
    state = {
      ...state,
      ...event.state,
      status: mergedStatus,
      activeSubagent: state.activeSubagent || null
    };
  } else if (event.type === "hook") {
    const status = event.status || {};
    let activeSubagent = state.activeSubagent || null;
    if (status.kind === "subagent-running") {
      activeSubagent = {
        type: status.subagentType || "agent",
        since: status.updatedAt || new Date().toISOString()
      };
    } else if (status.kind === "subagent-complete" || status.subagentEnded) {
      activeSubagent = null;
    }
    state = {
      ...state,
      status,
      history: appendHistory(state, status),
      activeSubagent
    };
  }
  state.updatedAt = new Date().toISOString();
  saveRuntimeState(state);
}

function maybeNotify(status) {
  if (!status || !status.attention) return;
  if (config.notifications && config.notifications.system && Notification.isSupported()) {
    new Notification({
      title: status.label || "Claude Code needs attention",
      body: status.detail || "Open Claude Code to continue.",
      icon: windowIconPath(),
      silent: !(config.notifications && config.notifications.sound)
    }).show();
  }
  if (petWindow && config.notifications && config.notifications.flashWindow) {
    petWindow.flashFrame(true);
    setTimeout(() => {
      if (petWindow && !petWindow.isDestroyed()) petWindow.flashFrame(false);
    }, 2500);
  }
}

async function handleBridgeEvent(event) {
  recordUsageFromEvent(event);
  updateStateFromEvent(event);
  broadcast();
  maybeNotify(event.status);
  if (userHidden) return;
  if (petWindow && !petWindow.isVisible()) petWindow.showInactive();
}

function assetPath(name) {
  return path.join(__dirname, "..", "renderer", "assets", name);
}

function windowIconPath() {
  return process.platform === "win32" ? assetPath("app-icon.ico") : assetPath("app-icon.png");
}

function quoteCommandArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function relaunchCommand() {
  if (!process.defaultApp) return quoteCommandArg(process.execPath);
  return `${quoteCommandArg(process.execPath)} ${quoteCommandArg(app.getAppPath())}`;
}

function applyWindowAppDetails(window) {
  if (process.platform !== "win32" || !window || window.isDestroyed()) return;
  window.setIcon(windowIconPath());
  window.setAppDetails({
    appId: APP_USER_MODEL_ID,
    appIconPath: windowIconPath(),
    relaunchCommand: relaunchCommand(),
    relaunchDisplayName: APP_NAME
  });
}

function trayIconImage() {
  return nativeImage.createFromPath(process.platform === "win32" ? assetPath("app-icon.ico") : assetPath("app-icon-32.png"));
}

function menuIconImage() {
  return nativeImage.createFromPath(assetPath("app-icon-16.png"));
}

function applyWindowConfig() {
  if (!petWindow) return;
  petWindow.setAlwaysOnTop(Boolean(config.alwaysOnTop), "screen-saver");
  petWindow.setOpacity(Number(config.opacity || 1));
  if (config.position && Number.isFinite(config.position.x) && Number.isFinite(config.position.y)) {
    const bounds = petWindow.getBounds();
    const display = screen.getDisplayMatching({ ...bounds, x: Math.round(config.position.x), y: Math.round(config.position.y) });
    const work = display.workArea;
    const x = Math.min(Math.max(work.x + 8, Math.round(config.position.x)), work.x + work.width - bounds.width - 8);
    const y = Math.min(Math.max(work.y + 8, Math.round(config.position.y)), work.y + work.height - bounds.height - 8);
    petWindow.setPosition(x, y, false);
  }
}

function schedulePositionSave() {
  if (!petWindow || petWindow.isDestroyed()) return;
  clearTimeout(savePositionTimer);
  savePositionTimer = setTimeout(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    config = saveConfig({ position: { x, y } });
    broadcast();
  }, 180);
}

function createPetWindow() {
  petWindow = new BrowserWindow({
    width: 438,
    height: 338,
    frame: false,
    transparent: true,
    resizable: true,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    icon: windowIconPath(),
    title: APP_NAME,
    alwaysOnTop: Boolean(config.alwaysOnTop),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  applyWindowAppDetails(petWindow);
  petWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"), { query: { view: "pet" } });
  petWindow.once("ready-to-show", () => {
    applyWindowConfig();
    petWindow.setIgnoreMouseEvents(true, { forward: true });
    petWindow.showInactive();
  });
  petWindow.on("moved", schedulePositionSave);
}

function createManagerWindow() {
  managerWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 820,
    minHeight: 600,
    show: false,
    title: "ClaudePet 设置中心",
    icon: windowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  applyWindowAppDetails(managerWindow);
  managerWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"), { query: { view: "manager" } });
  managerWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      managerWindow.hide();
    }
  });
}

function showManager() {
  if (!managerWindow) createManagerWindow();
  managerWindow.show();
  managerWindow.focus();
}

function createTray() {
  tray = new Tray(trayIconImage());
  tray.setToolTip("ClaudePet Claude Code 桌宠");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示桌宠",
        click: () => {
          userHidden = false;
          if (petWindow) petWindow.showInactive();
        }
      },
      {
        label: "隐藏桌宠",
        click: () => {
          userHidden = true;
          if (petWindow) petWindow.hide();
        }
      },
      { label: "打开设置", icon: menuIconImage(), click: showManager },
      { type: "separator" },
      {
        label: "总在最前",
        type: "checkbox",
        checked: Boolean(config.alwaysOnTop),
        click: (item) => {
          config = saveConfig({ alwaysOnTop: item.checked });
          applyWindowConfig();
          broadcast();
        }
      },
      { label: "退出", click: () => app.quit() }
    ])
  );
  tray.on("double-click", showManager);
}

function registerIpc() {
  ipcMain.handle("claudepet:get-initial", () => rendererPayload());
  ipcMain.handle("claudepet:update-config", (_event, patch) => {
    config = saveConfig(patch || {});
    applyWindowConfig();
    broadcast();
    return rendererPayload();
  });
  ipcMain.handle("claudepet:save-pet-manifest", (_event, petId, patch) => {
    const pet = savePetManifest(petId, patch || {});
    broadcast();
    return pet;
  });
  ipcMain.handle("claudepet:open-manager", () => {
    showManager();
    return true;
  });
  ipcMain.handle("claudepet:hide-pet", () => {
    userHidden = true;
    if (petWindow) petWindow.hide();
    return true;
  });
  ipcMain.handle("claudepet:drag-window", (_event, delta) => {
    if (!petWindow || petWindow.isDestroyed()) return false;
    const dx = Math.round(Number(delta && delta.dx) || 0);
    const dy = Math.round(Number(delta && delta.dy) || 0);
    if (!dx && !dy) return true;
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(x + dx, y + dy, false);
    return true;
  });
  ipcMain.handle("claudepet:set-passthrough", (_event, ignore) => {
    if (!petWindow || petWindow.isDestroyed()) return false;
    if (ignore) petWindow.setIgnoreMouseEvents(true, { forward: true });
    else petWindow.setIgnoreMouseEvents(false);
    return true;
  });
  ipcMain.handle("claudepet:quit-app", () => {
    app.quit();
    return true;
  });
  ipcMain.handle("claudepet:get-usage", () => {
    try {
      return getUsageOverview();
    } catch (error) {
      return { error: String(error && error.message ? error.message : error) };
    }
  });
}

async function boot() {
  try {
    const retention = Number(config.stats && config.stats.retentionDays);
    if (Number.isFinite(retention) && retention > 0) pruneOldData(retention);
  } catch (error) {
    if (process.env.CLAUDEPET_DEBUG) console.error("[claudepet] usage prune failed", error);
  }
  registerIpc();
  createPetWindow();
  createManagerWindow();
  createTray();
  bridge = await startBridgeServer({
    getState: rendererPayload,
    onEvent: handleBridgeEvent,
    onConfig: (patch) => {
      config = saveConfig(patch || {});
      applyWindowConfig();
      broadcast();
      return rendererPayload();
    }
  });
  broadcast();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (petWindow && !petWindow.isDestroyed()) {
      userHidden = false;
      if (!petWindow.isVisible()) petWindow.showInactive();
      petWindow.focus();
    }
  });
  app.whenReady().then(boot);
}

app.on("before-quit", () => {
  app.isQuitting = true;
  if (bridge) bridge.close();
});

app.on("window-all-closed", (event) => {
  if (app.isQuitting) return;
  event.preventDefault();
});
