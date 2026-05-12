const path = require("node:path");
const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, screen, Tray } = require("electron");
const { startBridgeServer } = require("./bridge-server");
const { loadConfig, saveConfig } = require("../shared/config");
const { listPets, savePetManifest } = require("../shared/pets");
const {
  DEFAULT_SESSION_ID,
  DEFAULT_SESSION_STATE,
  appendHistory,
  listSessions,
  loadSessionState,
  pruneStaleSessions,
  removeSession,
  resolveSessionId,
  saveSessionState
} = require("../shared/runtime-state");
const { recordSnapshot, snapshotFromState, projectKeyFrom, pruneOldData, getUsageOverview } = require("../shared/usage");

const APP_NAME = "ClaudePet";
const APP_USER_MODEL_ID = "com.liuchenlili.ClaudePet";
const SESSION_INACTIVITY_MS = 15 * 60 * 1000;
const SESSION_PRUNE_INTERVAL_MS = 60 * 1000;
const SESSION_REBIND_WINDOW_MS = 5 * 60 * 1000;
const PET_WINDOW_OFFSET = 36;

app.setName(APP_NAME);
if (process.platform === "win32") {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

const sessions = new Map();
const petWindows = new Map();
const userHidden = new Set();
const positionSaveTimers = new Map();
let managerWindow = null;
let tray = null;
let bridge = null;
let config = loadConfig();
let pruneTimer = null;

function cloneDefaultSessionState() {
  return JSON.parse(JSON.stringify(DEFAULT_SESSION_STATE));
}

function getSessionState(sessionId) {
  const id = resolveSessionId(sessionId);
  if (!sessions.has(id)) sessions.set(id, cloneDefaultSessionState());
  return sessions.get(id);
}

function setSessionState(sessionId, nextState) {
  const id = resolveSessionId(sessionId);
  sessions.set(id, nextState);
  saveSessionState(id, nextState);
  return nextState;
}

function dropSession(sessionId) {
  const id = resolveSessionId(sessionId);
  sessions.delete(id);
  userHidden.delete(id);
  removeSession(id);
  if (id === DEFAULT_SESSION_ID) return;
  const overrides = { ...(config.selectedPets || {}) };
  const positions = { ...(config.positions || {}) };
  const panelVisibility = { ...(config.panelVisibility || {}) };
  let changed = false;
  if (id in overrides) { delete overrides[id]; changed = true; }
  if (id in positions) { delete positions[id]; changed = true; }
  if (id in panelVisibility) { delete panelVisibility[id]; changed = true; }
  if (changed) config = saveConfig({ selectedPets: overrides, positions, panelVisibility });
}

function sessionSummary(sessionId) {
  const id = resolveSessionId(sessionId);
  const state = sessions.get(id) || cloneDefaultSessionState();
  return {
    sessionId: id,
    cwdName: (state.session && state.session.cwdName) || "",
    cwd: (state.session && state.session.cwd) || "",
    status: state.status || null,
    updatedAt: state.updatedAt || null,
    lastEventAt: state.lastEventAt || null
  };
}

function effectivePetIdFor(sessionId) {
  const id = resolveSessionId(sessionId);
  const overrides = (config && config.selectedPets) || {};
  return overrides[id] || config.selectedPet;
}

function effectivePanelVisibilityFor(sessionId) {
  const id = resolveSessionId(sessionId);
  const overrides = (config && config.panelVisibility) || {};
  if (typeof overrides[id] === "boolean") return overrides[id];
  return Boolean(config.showPanel);
}

function rendererPayloadFor(sessionId) {
  const id = resolveSessionId(sessionId);
  const sessionConfig = {
    ...config,
    selectedPet: effectivePetIdFor(id),
    showPanel: effectivePanelVisibilityFor(id)
  };
  return {
    sessionId: id,
    state: sessions.get(id) || cloneDefaultSessionState(),
    config: sessionConfig,
    pets: listPets(),
    appVersion: app.getVersion(),
    sessionsList: Array.from(sessions.keys()).map(sessionSummary)
  };
}

function managerPayload() {
  const firstId = sessions.keys().next().value || DEFAULT_SESSION_ID;
  const payload = rendererPayloadFor(firstId);
  payload.sessionId = null;
  return payload;
}

function broadcastSession(sessionId) {
  const id = resolveSessionId(sessionId);
  const window = petWindows.get(id);
  if (window && !window.isDestroyed()) {
    window.webContents.send("claudepet:update", rendererPayloadFor(id));
  }
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.webContents.send("claudepet:update", managerPayload());
  }
}

function broadcastConfigChange() {
  for (const [id, window] of petWindows.entries()) {
    if (!window.isDestroyed()) window.webContents.send("claudepet:update", rendererPayloadFor(id));
  }
  if (managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.webContents.send("claudepet:update", managerPayload());
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
    if (process.env.CLAUDEPET_DEBUG) console.error("[claudepet] usage record failed", error);
  }
}

function sessionIdFromEvent(event) {
  if (event && event.sessionId) return event.sessionId;
  if (event && event.type === "statusline") {
    const fromState = event.state && event.state.session && event.state.session.id;
    if (fromState) return fromState;
    const fromRaw = event.raw && event.raw.session_id;
    if (fromRaw) return fromRaw;
  }
  if (event && event.type === "hook") {
    const fromRaw = event.raw && event.raw.session_id;
    if (fromRaw) return fromRaw;
  }
  return DEFAULT_SESSION_ID;
}

function cwdFromEvent(event) {
  if (!event) return "";
  if (event.type === "statusline") {
    const fromState = event.state && event.state.session && event.state.session.cwd;
    if (fromState) return fromState;
    const raw = event.raw || {};
    return (raw.workspace && raw.workspace.current_dir)
      || (raw.workspace && raw.workspace.project_dir)
      || raw.cwd
      || "";
  }
  if (event.type === "hook") {
    const raw = event.raw || {};
    return (raw.workspace && raw.workspace.current_dir)
      || (raw.workspace && raw.workspace.project_dir)
      || raw.cwd
      || "";
  }
  return "";
}

function findRebindCandidate(newSessionId, cwd) {
  if (!cwd || !newSessionId) return null;
  if (sessions.has(newSessionId)) return null;
  const now = Date.now();
  let best = null;
  let bestTime = 0;
  for (const [id, state] of sessions.entries()) {
    if (id === newSessionId) continue;
    if (id === DEFAULT_SESSION_ID) continue;
    const stateCwd = state.session && state.session.cwd;
    if (stateCwd !== cwd) continue;
    const last = Date.parse(state.lastEventAt || state.updatedAt || 0);
    if (!Number.isFinite(last)) continue;
    if (now - last > SESSION_REBIND_WINDOW_MS) continue;
    if (last > bestTime) {
      bestTime = last;
      best = id;
    }
  }
  return best;
}

function rebindSession(oldId, newId) {
  if (!oldId || !newId || oldId === newId) return;
  const state = sessions.get(oldId);
  if (state) sessions.set(newId, state);
  sessions.delete(oldId);
  const window = petWindows.get(oldId);
  if (window) {
    petWindows.set(newId, window);
    petWindows.delete(oldId);
  }
  if (userHidden.has(oldId)) {
    userHidden.add(newId);
    userHidden.delete(oldId);
  }
  const timer = positionSaveTimers.get(oldId);
  if (timer) {
    positionSaveTimers.set(newId, timer);
    positionSaveTimers.delete(oldId);
  }
  const overrides = { ...(config.selectedPets || {}) };
  const positions = { ...(config.positions || {}) };
  const panelVisibility = { ...(config.panelVisibility || {}) };
  let changed = false;
  if (oldId in overrides) { overrides[newId] = overrides[oldId]; delete overrides[oldId]; changed = true; }
  if (oldId in positions) { positions[newId] = positions[oldId]; delete positions[oldId]; changed = true; }
  if (oldId in panelVisibility) { panelVisibility[newId] = panelVisibility[oldId]; delete panelVisibility[oldId]; changed = true; }
  if (changed) config = saveConfig({ selectedPets: overrides, positions, panelVisibility });
  removeSession(oldId);
  if (state) saveSessionState(newId, state);
}

function updateSessionFromEvent(sessionId, event) {
  const id = resolveSessionId(sessionId);
  const current = getSessionState(id);
  let next = current;
  if (event.type === "statusline") {
    const incoming = event.state.status || null;
    const activeStatus = isRecentActiveStatus(current.status) ? current.status : null;
    let mergedStatus;
    if (activeStatus) {
      mergedStatus = incoming && incoming.detail !== undefined
        ? { ...activeStatus, detail: incoming.detail, updatedAt: activeStatus.updatedAt }
        : activeStatus;
    } else {
      mergedStatus = incoming || current.status;
    }
    next = {
      ...current,
      ...event.state,
      status: mergedStatus,
      activeSubagent: current.activeSubagent || null
    };
  } else if (event.type === "hook") {
    const status = event.status || {};
    let activeSubagent = current.activeSubagent || null;
    if (status.kind === "subagent-running") {
      activeSubagent = {
        type: status.subagentType || "agent",
        since: status.updatedAt || new Date().toISOString()
      };
    } else if (status.kind === "subagent-complete" || status.subagentEnded) {
      activeSubagent = null;
    }
    next = {
      ...current,
      status,
      history: appendHistory(current, status),
      activeSubagent
    };
  }
  next.updatedAt = new Date().toISOString();
  next.lastEventAt = next.updatedAt;
  setSessionState(id, next);
  return next;
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
  for (const window of petWindows.values()) {
    if (window && !window.isDestroyed() && config.notifications && config.notifications.flashWindow) {
      window.flashFrame(true);
      setTimeout(() => {
        if (window && !window.isDestroyed()) window.flashFrame(false);
      }, 2500);
    }
  }
}

function isSessionEndEvent(event) {
  if (!event || event.type !== "hook") return false;
  const name = event.raw && event.raw.hook_event_name;
  return name === "SessionEnd";
}

async function handleBridgeEvent(event) {
  recordUsageFromEvent(event);
  const sessionId = resolveSessionId(sessionIdFromEvent(event));
  if (isSessionEndEvent(event)) {
    closePetWindow(sessionId, { dropSession: true });
    if (managerWindow && !managerWindow.isDestroyed()) {
      managerWindow.webContents.send("claudepet:update", managerPayload());
    }
    return;
  }
  // Claude Code's /clear starts a brand-new session_id while staying in the
  // same cwd. If a pet for the previous session is still active here, hand
  // its window over to the new session instead of spawning another window.
  if (sessionId !== DEFAULT_SESSION_ID && !sessions.has(sessionId)) {
    const candidate = findRebindCandidate(sessionId, cwdFromEvent(event));
    if (candidate) rebindSession(candidate, sessionId);
  }
  updateSessionFromEvent(sessionId, event);
  ensurePetWindow(sessionId);
  broadcastSession(sessionId);
  maybeNotify(event.status);
  if (userHidden.has(sessionId)) return;
  const window = petWindows.get(sessionId);
  if (window && !window.isDestroyed() && !window.isVisible()) window.showInactive();
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

function resolveStoredPosition(sessionId) {
  const positions = (config && config.positions) || {};
  const direct = positions[sessionId];
  if (direct && Number.isFinite(direct.x) && Number.isFinite(direct.y)) return direct;
  if (sessionId === DEFAULT_SESSION_ID && config.position && Number.isFinite(config.position.x) && Number.isFinite(config.position.y)) {
    return config.position;
  }
  return null;
}

function pickInitialPosition(sessionId) {
  const stored = resolveStoredPosition(sessionId);
  if (stored) return stored;
  const primary = screen.getPrimaryDisplay();
  const work = primary.workArea;
  const baseX = work.x + work.width - 460;
  const baseY = work.y + work.height - 360;
  const offsetIndex = petWindows.size;
  return {
    x: baseX - offsetIndex * PET_WINDOW_OFFSET,
    y: baseY - offsetIndex * PET_WINDOW_OFFSET
  };
}

function applyWindowConfigTo(window, sessionId) {
  if (!window || window.isDestroyed()) return;
  window.setAlwaysOnTop(Boolean(config.alwaysOnTop), "screen-saver");
  window.setOpacity(Number(config.opacity || 1));
  const target = resolveStoredPosition(sessionId);
  if (target) {
    const bounds = window.getBounds();
    const display = screen.getDisplayMatching({ ...bounds, x: Math.round(target.x), y: Math.round(target.y) });
    const work = display.workArea;
    const x = Math.min(Math.max(work.x + 8, Math.round(target.x)), work.x + work.width - bounds.width - 8);
    const y = Math.min(Math.max(work.y + 8, Math.round(target.y)), work.y + work.height - bounds.height - 8);
    window.setPosition(x, y, false);
  }
}

function applyConfigToAllWindows() {
  for (const [id, window] of petWindows.entries()) {
    applyWindowConfigTo(window, id);
  }
}

function schedulePositionSave(sessionId) {
  const window = petWindows.get(sessionId);
  if (!window || window.isDestroyed()) return;
  clearTimeout(positionSaveTimers.get(sessionId));
  positionSaveTimers.set(
    sessionId,
    setTimeout(() => {
      const target = petWindows.get(sessionId);
      if (!target || target.isDestroyed()) return;
      const [x, y] = target.getPosition();
      const positions = { ...(config.positions || {}), [sessionId]: { x, y } };
      const patch = { positions };
      if (sessionId === DEFAULT_SESSION_ID) patch.position = { x, y };
      config = saveConfig(patch);
      broadcastConfigChange();
    }, 180)
  );
}

function ensurePetWindow(sessionId) {
  const id = resolveSessionId(sessionId);
  const existing = petWindows.get(id);
  if (existing && !existing.isDestroyed()) return existing;
  if (existing) petWindows.delete(id);
  return createPetWindow(id);
}

function createPetWindow(sessionId) {
  const id = resolveSessionId(sessionId);
  const initial = pickInitialPosition(id);
  const window = new BrowserWindow({
    width: 438,
    height: 338,
    x: Math.round(initial.x),
    y: Math.round(initial.y),
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
  applyWindowAppDetails(window);
  window.loadFile(path.join(__dirname, "..", "renderer", "index.html"), {
    query: { view: "pet", session: id }
  });
  window.once("ready-to-show", () => {
    applyWindowConfigTo(window, id);
    window.setIgnoreMouseEvents(true, { forward: true });
    if (!userHidden.has(id)) window.showInactive();
  });
  window.on("moved", () => schedulePositionSave(id));
  window.on("closed", () => {
    petWindows.delete(id);
    clearTimeout(positionSaveTimers.get(id));
    positionSaveTimers.delete(id);
  });
  petWindows.set(id, window);
  return window;
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

function showAllPets() {
  if (petWindows.size === 0) ensurePetWindow(DEFAULT_SESSION_ID);
  for (const [id, window] of petWindows.entries()) {
    userHidden.delete(id);
    if (window && !window.isDestroyed()) window.showInactive();
  }
}

function hideAllPets() {
  for (const [id, window] of petWindows.entries()) {
    userHidden.add(id);
    if (window && !window.isDestroyed()) window.hide();
  }
}

function closePetWindow(sessionId, options = {}) {
  const id = resolveSessionId(sessionId);
  const window = petWindows.get(id);
  if (window && !window.isDestroyed()) window.destroy();
  petWindows.delete(id);
  if (options.dropSession) dropSession(id);
}

function pruneInactiveSessions() {
  const removed = pruneStaleSessions(SESSION_INACTIVITY_MS);
  for (const id of removed) {
    sessions.delete(id);
    const window = petWindows.get(id);
    if (window && !window.isDestroyed()) window.destroy();
    petWindows.delete(id);
    userHidden.delete(id);
  }
  if (removed.length && managerWindow && !managerWindow.isDestroyed()) {
    managerWindow.webContents.send("claudepet:update", managerPayload());
  }
}

function createTray() {
  tray = new Tray(trayIconImage());
  tray.setToolTip("ClaudePet Claude Code 桌宠");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示所有桌宠", click: () => showAllPets() },
      { label: "隐藏所有桌宠", click: () => hideAllPets() },
      { label: "打开设置", icon: menuIconImage(), click: showManager },
      { type: "separator" },
      {
        label: "总在最前",
        type: "checkbox",
        checked: Boolean(config.alwaysOnTop),
        click: (item) => {
          config = saveConfig({ alwaysOnTop: item.checked });
          applyConfigToAllWindows();
          broadcastConfigChange();
        }
      },
      { label: "退出", click: () => app.quit() }
    ])
  );
  tray.on("double-click", showManager);
}

function findSessionForWebContents(webContents) {
  for (const [id, window] of petWindows.entries()) {
    if (!window.isDestroyed() && window.webContents === webContents) return id;
  }
  return null;
}

function registerIpc() {
  ipcMain.handle("claudepet:get-initial", (event) => {
    const sessionId = findSessionForWebContents(event.sender);
    if (sessionId) return rendererPayloadFor(sessionId);
    return managerPayload();
  });
  ipcMain.handle("claudepet:update-config", (_event, patch) => {
    config = saveConfig(patch || {});
    applyConfigToAllWindows();
    broadcastConfigChange();
    return managerPayload();
  });
  ipcMain.handle("claudepet:save-pet-manifest", (_event, petId, patch) => {
    const pet = savePetManifest(petId, patch || {});
    broadcastConfigChange();
    return pet;
  });
  ipcMain.handle("claudepet:open-manager", () => {
    showManager();
    return true;
  });
  ipcMain.handle("claudepet:hide-pet", (event) => {
    const sessionId = findSessionForWebContents(event.sender);
    if (sessionId) {
      userHidden.add(sessionId);
      const window = petWindows.get(sessionId);
      if (window && !window.isDestroyed()) window.hide();
    }
    return true;
  });
  ipcMain.handle("claudepet:toggle-panel", (event) => {
    const sessionId = findSessionForWebContents(event.sender);
    if (!sessionId) return false;
    const next = !effectivePanelVisibilityFor(sessionId);
    const panelVisibility = { ...(config.panelVisibility || {}), [sessionId]: next };
    config = saveConfig({ panelVisibility });
    broadcastSession(sessionId);
    return next;
  });
  ipcMain.handle("claudepet:set-session-pet", (event, petId) => {
    const sessionId = findSessionForWebContents(event.sender);
    if (!sessionId || !petId) return false;
    const known = listPets().some((pet) => pet.id === petId);
    if (!known) return false;
    const selectedPets = { ...(config.selectedPets || {}), [sessionId]: petId };
    config = saveConfig({ selectedPets });
    broadcastSession(sessionId);
    return true;
  });
  ipcMain.handle("claudepet:close-pet", (event) => {
    const sessionId = findSessionForWebContents(event.sender);
    if (sessionId) closePetWindow(sessionId, { dropSession: true });
    return true;
  });
  ipcMain.handle("claudepet:drag-window", (event, delta) => {
    const sessionId = findSessionForWebContents(event.sender);
    const window = sessionId ? petWindows.get(sessionId) : null;
    if (!window || window.isDestroyed()) return false;
    const dx = Math.round(Number(delta && delta.dx) || 0);
    const dy = Math.round(Number(delta && delta.dy) || 0);
    if (!dx && !dy) return true;
    const [x, y] = window.getPosition();
    window.setPosition(x + dx, y + dy, false);
    return true;
  });
  ipcMain.handle("claudepet:set-passthrough", (event, ignore) => {
    const sessionId = findSessionForWebContents(event.sender);
    const window = sessionId ? petWindows.get(sessionId) : null;
    if (!window || window.isDestroyed()) return false;
    if (ignore) window.setIgnoreMouseEvents(true, { forward: true });
    else window.setIgnoreMouseEvents(false);
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

function hydrateSessionsFromDisk() {
  const stored = listSessions();
  for (const entry of stored) {
    sessions.set(entry.sessionId, entry.state);
  }
}

async function boot() {
  try {
    const retention = Number(config.stats && config.stats.retentionDays);
    if (Number.isFinite(retention) && retention > 0) pruneOldData(retention);
  } catch (error) {
    if (process.env.CLAUDEPET_DEBUG) console.error("[claudepet] usage prune failed", error);
  }
  hydrateSessionsFromDisk();
  registerIpc();
  for (const id of sessions.keys()) {
    ensurePetWindow(id);
  }
  if (petWindows.size === 0) {
    ensurePetWindow(DEFAULT_SESSION_ID);
  }
  createManagerWindow();
  createTray();
  bridge = await startBridgeServer({
    getState: managerPayload,
    onEvent: handleBridgeEvent,
    onConfig: (patch) => {
      config = saveConfig(patch || {});
      applyConfigToAllWindows();
      broadcastConfigChange();
      return managerPayload();
    }
  });
  pruneTimer = setInterval(pruneInactiveSessions, SESSION_PRUNE_INTERVAL_MS);
  broadcastConfigChange();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showAllPets();
  });
  app.whenReady().then(boot);
}

app.on("before-quit", () => {
  app.isQuitting = true;
  if (pruneTimer) clearInterval(pruneTimer);
  if (bridge) bridge.close();
});

app.on("window-all-closed", (event) => {
  if (app.isQuitting) return;
  event.preventDefault();
});
