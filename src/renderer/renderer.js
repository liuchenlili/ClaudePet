const query = new URLSearchParams(location.search);
const view = query.get("view") || "pet";

const model = {
  state: null,
  config: null,
  pets: [],
  selectedManagerPet: null,
  frame: 0,
  lastFrameAt: 0,
  drag: {
    active: false,
    direction: "right",
    lastScreenX: 0,
    lastScreenY: 0
  },
  ui: {
    expanded: false
  },
  usage: null,
  usageRange: "today",
  usageLoading: false,
  managerTab: "pets"
};

let manifestSaveFlash = { text: "", tone: "" };
let manifestSaveFlashTimer = null;
function setManifestSaveFlash(text, tone) {
  manifestSaveFlash = { text: text || "", tone: tone || "" };
  const node = document.querySelector("[data-save-status]");
  if (node) {
    node.textContent = manifestSaveFlash.text;
    node.dataset.tone = manifestSaveFlash.tone;
  }
  if (manifestSaveFlashTimer) clearTimeout(manifestSaveFlashTimer);
  if (tone === "ok" || tone === "error") {
    manifestSaveFlashTimer = setTimeout(() => {
      manifestSaveFlash = { text: "", tone: "" };
      const later = document.querySelector("[data-save-status]");
      if (later) {
        later.textContent = "";
        later.dataset.tone = "";
      }
    }, 3000);
  }
}

const ICONS = {
  pet: '<path d="M7.5 8.5c.9 0 1.6-.9 1.6-2s-.7-2-1.6-2-1.6.9-1.6 2 .7 2 1.6 2Z"/><path d="M16.5 8.5c.9 0 1.6-.9 1.6-2s-.7-2-1.6-2-1.6.9-1.6 2 .7 2 1.6 2Z"/><path d="M8.4 14.1c1-1.1 1.6-2.1 3.6-2.1s2.6 1 3.6 2.1c1.2 1.3 2.1 2.2 1.4 3.6-.7 1.3-2.6.8-5 .8s-4.3.5-5-.8c-.7-1.4.2-2.3 1.4-3.6Z"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18h1.3a1.9 1.9 0 0 0 1.3-3.2 1.7 1.7 0 0 1 1.1-2.9H17a4 4 0 0 0 4-4c0-4.4-4-7.9-9-7.9Z"/><circle cx="7.7" cy="10.4" r=".8"/><circle cx="10.4" cy="7.6" r=".8"/><circle cx="14" cy="7.6" r=".8"/><circle cx="16.5" cy="10.4" r=".8"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/>',
  settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2 3.4-.2-.1a1.8 1.8 0 0 0-2.1.2 7.4 7.4 0 0 1-1.8.8 1.8 1.8 0 0 0-1.5 1.4V23h-4v-.2a1.8 1.8 0 0 0-1.5-1.4 7.4 7.4 0 0 1-1.8-.8 1.8 1.8 0 0 0-2.1-.2l-.2.1-2-3.4.1-.1a1.8 1.8 0 0 0 .4-2 7.8 7.8 0 0 1 0-2.1 1.8 1.8 0 0 0-.4-2l-.1-.1 2-3.4.2.1a1.8 1.8 0 0 0 2.1-.2 7.4 7.4 0 0 1 1.8-.8A1.8 1.8 0 0 0 8.3 5V4h4v1a1.8 1.8 0 0 0 1.5 1.4 7.4 7.4 0 0 1 1.8.8 1.8 1.8 0 0 0 2.1.2l.2-.1 2 3.4-.1.1a1.8 1.8 0 0 0-.4 2 7.8 7.8 0 0 1 0 2.2Z"/>',
  save: '<path d="M5 4h12l2 2v14H5V4Z"/><path d="M8 4v6h8V4"/><path d="M8 20v-6h8v6"/>',
  download: '<path d="M12 3v11"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/>',
  folder: '<path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-10Z"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m7 17 4-4 3 3 2-2 3 3"/>',
  grid: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
  play: '<path d="M7 5v14l11-7L7 5Z"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 6 2 8H4c0-2 2-2 2-8Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  pin: '<path d="M12 17v5"/><path d="M8 3h8l-1 7 3 3v2H6v-2l3-3-1-7Z"/>',
  panel: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 10h16"/><path d="M9 10v9"/>',
  fields: '<path d="M5 6h14"/><path d="M5 12h14"/><path d="M5 18h14"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  refresh: '<path d="M20 12a8 8 0 0 1-14.6 4.5"/><path d="M4 17v-5h5"/><path d="M4 12A8 8 0 0 1 18.6 7.5"/><path d="M20 7v5h-5"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  alert: '<path d="M12 8v5"/><path d="M12 17h.01"/><path d="M10.3 4.8 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.8a2 2 0 0 0-3.4 0Z"/>',
  spark: '<path d="M12 3l1.4 5.1L18 10l-4.6 1.9L12 17l-1.4-5.1L6 10l4.6-1.9L12 3Z"/><path d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z"/>',
  tag: '<path d="M20.5 13.5 13.5 20.5a2 2 0 0 1-2.8 0L3 12.8V4h8.8l8.7 8.7a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  text: '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h16"/>',
  ruler: '<path d="M4 17.5 17.5 4l2.5 2.5L6.5 20H4v-2.5Z"/><path d="m14 7 3 3"/><path d="m11.5 9.5 1.5 1.5"/><path d="m9 12 3 3"/>',
  columns: '<path d="M5 4h14"/><path d="M5 20h14"/><rect x="6" y="7" width="3.5" height="10"/><rect x="10.25" y="7" width="3.5" height="10"/><rect x="14.5" y="7" width="3.5" height="10"/>',
  zoom: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  anchor: '<path d="M12 3v18"/><path d="M8 7a4 4 0 1 1 8 0c0 2-1.6 3.3-4 3.3S8 9 8 7Z"/><path d="M5 15c1.5 4 5.3 6 7 6s5.5-2 7-6"/><path d="M3 15h4"/><path d="M17 15h4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A10.3 10.3 0 0 1 12 4c5 0 8.5 4.5 9.5 8a12.7 12.7 0 0 1-2.3 3.8"/><path d="M6.6 6.7C4.5 8 3.1 10.1 2.5 12c1 3.5 4.5 8 9.5 8 1.4 0 2.7-.3 3.8-.9"/>',
  power: '<path d="M12 3v8"/><path d="M7.1 6.9a7 7 0 1 0 9.8 0"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'
};

function icon(name, label = "") {
  const body = ICONS[name];
  const svg = body ? `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>` : "";
  return label ? `${svg}<span>${escapeHtml(label)}</span>` : svg;
}

function sectionTitle(iconName, title) {
  return `<div class="section-title">${icon(iconName)}<h2>${escapeHtml(title)}</h2></div>`;
}

function toolActionDetail(status) {
  if (!status) return "";
  if (status.target) return status.target;
  if (status.tool) return status.tool;
  return status.label || "";
}

function taskStatusLine(status, activeSubagent) {
  const isToolEvent = status && (status.kind === "running-tool" || status.kind === "tool-complete" || status.kind === "tool-error");
  if (activeSubagent && activeSubagent.type) {
    if (isToolEvent && status.tool) {
      const action = status.kind === "tool-complete" ? "✓" : status.kind === "tool-error" ? "!" : "→";
      const detail = status.target ? `${action} ${status.tool} · ${status.target}` : `${action} ${status.tool}`;
      return { tone: "subagent", icon: "via", title: activeSubagent.type, detail };
    }
    return { tone: "subagent", icon: "via", title: activeSubagent.type, detail: (status && status.label) || "working" };
  }
  if (!status || !status.kind || status.kind === "idle") {
    return { tone: "idle", icon: "·", title: "Idle", detail: "" };
  }
  if (status.kind === "waiting-permission") return { tone: "warn", icon: "?", title: "Awaiting confirm", detail: status.label || "" };
  if (status.kind === "waiting-input") return { tone: "warn", icon: "?", title: "Awaiting input", detail: status.label || "" };
  if (status.severity === "error" || status.kind === "tool-error" || status.kind === "error") {
    const title = status.tool ? `${status.tool} failed` : (status.label || "Error");
    return { tone: "error", icon: "!", title, detail: status.target || "" };
  }
  if (status.kind === "completed") return { tone: "done", icon: "✓", title: "Claude finished", detail: "" };
  if (status.kind === "compacting" || status.kind === "compacted") {
    return { tone: "work", icon: "·", title: "Compacting", detail: "" };
  }
  if (isToolEvent && status.tool) {
    const verb = status.kind === "tool-complete" ? "✓" : "→";
    return { tone: "work", icon: verb, title: status.tool, detail: toolActionDetail(status) };
  }
  if (WORKING_KINDS.has(status.kind)) {
    return { tone: "work", icon: "·", title: "Working", detail: status.label || "" };
  }
  return { tone: "work", icon: "·", title: status.label || kindLabel(status.kind), detail: "" };
}

function $(selector, root = document) {
  return root.querySelector(selector);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function number(value, fallback = "--") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  return Number(value).toLocaleString("en-US");
}

function compactNumber(value, fallback = "--") {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
  const numeric = Number(value);
  if (Math.abs(numeric) >= 1000000) return `${(numeric / 1000000).toFixed(numeric >= 10000000 ? 0 : 1)}M`;
  if (Math.abs(numeric) >= 1000) return `${(numeric / 1000).toFixed(numeric >= 10000 ? 0 : 1)}K`;
  return String(Math.round(numeric));
}

function pct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return `${Math.round(Number(value))}%`;
}

function activePet() {
  return model.pets.find((pet) => pet.id === model.config.selectedPet) || model.pets[0];
}

function animationFor(pet) {
  if (model.drag.active) return (pet.animations && pet.animations.run) || pet.animations.tool || pet.animations.idle;
  const status = model.state.status || {};
  return (pet.animations && pet.animations[status.animation]) || pet.animations.idle;
}

function framePosition(pet, frame) {
  const col = frame % pet.columns;
  const row = Math.floor(frame / pet.columns);
  return {
    x: -(col * pet.frameWidth),
    y: -(row * pet.frameHeight)
  };
}

function fitScale(element, pet, requestedScale) {
  if (!element || !pet) return requestedScale;
  const fitHost = element.closest("[data-fit-host]");
  if (!fitHost) return requestedScale;
  const rect = fitHost.getBoundingClientRect();
  const maxWidth = Math.max(1, rect.width - 8);
  const maxHeight = Math.max(1, rect.height - 8);
  return Math.min(requestedScale, maxWidth / pet.frameWidth, maxHeight / pet.frameHeight);
}

function applyFrame(element, pet, frame, scale = model.config.scale, options = {}) {
  if (!element || !pet) return;
  const resolvedScale = options.fit ? fitScale(element, pet, scale) : scale;
  const fitHost = element.closest("[data-fit-host]");
  const pos = framePosition(pet, frame);
  element.style.width = `${pet.frameWidth * resolvedScale}px`;
  element.style.height = `${pet.frameHeight * resolvedScale}px`;
  element.style.backgroundImage = `url("${pet.spritesheetUrl}")`;
  element.style.backgroundSize = `${pet.imageWidth * resolvedScale}px ${pet.imageHeight * resolvedScale}px`;
  element.style.backgroundPosition = `${pos.x * resolvedScale}px ${pos.y * resolvedScale}px`;
  if (element.matches("[data-pet]") && fitHost) {
    fitHost.style.setProperty("--pet-render-width", `${pet.frameWidth * resolvedScale}px`);
    fitHost.style.setProperty("--pet-render-height", `${pet.frameHeight * resolvedScale}px`);
  }
}

function severityClass(status) {
  if (!status) return "";
  if (status.severity === "error") return "error";
  if (status.severity === "warning" || status.attention) return "warning";
  return "";
}

const WORKING_KINDS = new Set([
  "thinking", "running-tool", "tool-complete", "tool-batch",
  "subagent-running", "subagent-complete",
  "task-created", "task-completed",
  "compacting", "compacted", "activity"
]);

function attentionWord(status) {
  if (!status) return "READY";
  if (status.severity === "error") return "ERROR";
  if (status.kind === "completed") return "DONE";
  if (status.kind === "waiting-permission" || status.kind === "waiting-input") return "CHECK";
  if (status.attention && !WORKING_KINDS.has(status.kind)) return "CHECK";
  if (status.kind === "compacting" || status.kind === "compacted") return "PACK";
  if (WORKING_KINDS.has(status.kind)) return "TOOL";
  return "READY";
}

function phaseClass(status, activeSubagent) {
  const kind = status && status.kind;
  if (activeSubagent) return "phase-working";
  if (!kind || kind === "idle") return "phase-idle";
  if (status.severity === "error" || kind === "error" || kind === "tool-error") return "phase-error";
  if (kind === "waiting-permission" || kind === "waiting-input") return "phase-waiting";
  if (kind === "completed") return "phase-done";
  return "phase-working";
}

function statusLineText(status) {
  if (!status || !status.kind || status.kind === "idle") return "ready";
  if (status.kind === "waiting-permission") return "confirm";
  if (status.kind === "waiting-input") return "input";
  if (status.kind === "completed") return "done";
  if (status.kind === "compacting" || status.kind === "compacted") return "compact";
  if (status.severity === "error") return "error";
  if (WORKING_KINDS.has(status.kind)) return "working";
  return status.kind.replace(/-/g, " ");
}

const KIND_LABELS = {
  idle: "Idle",
  thinking: "Thinking",
  "running-tool": "Running tool",
  "tool-complete": "Tool finished",
  "tool-error": "Tool failed",
  "tool-batch": "Tool batch",
  "waiting-permission": "Awaiting confirm",
  "waiting-input": "Awaiting input",
  notification: "Notice",
  "subagent-running": "Subagent running",
  "subagent-complete": "Subagent done",
  "task-created": "Task created",
  "task-completed": "Task completed",
  completed: "Claude finished",
  error: "Error",
  compacting: "Compacting",
  compacted: "Compacted",
  activity: "Activity"
};

function kindLabel(kind) {
  if (!kind) return "Idle";
  return KIND_LABELS[kind] || kind.replace(/-/g, " ");
}

function statusTitle(status) {
  if (!status || !status.kind || status.kind === "idle") return "Ready";
  if (status.kind === "running-tool" || status.kind === "tool-complete" || status.kind === "tool-error") {
    return status.label || kindLabel(status.kind);
  }
  if (status.kind === "waiting-permission") return "Needs confirmation";
  if (status.kind === "waiting-input") return "Waiting for input";
  if (status.kind === "completed") return "Claude finished";
  if (status.kind === "task-completed" || status.kind === "subagent-complete") return "Working on it";
  if (status.kind === "compacting") return "Compacting context";
  if (status.severity === "error") return status.label || "Something failed";
  return status.label || kindLabel(status.kind);
}

function gitText(git) {
  if (!git || !git.isRepo) return "非 git 仓库";
  const marks = [];
  if (git.dirty) marks.push("有改动");
  if (git.ahead) marks.push(`领先${git.ahead}`);
  if (git.behind) marks.push(`落后${git.behind}`);
  return `${git.branch}${marks.length ? ` ${marks.join(" ")}` : ""}`;
}

function meterRow({ label, value, max, percent, tone = "context" }) {
  const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
  return `
    <div class="hud-meter ${tone}">
      <div class="hud-meter-head">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
      <div class="hud-bar"><span style="width:${safePercent}%"></span></div>
      <div class="hud-meter-foot">
        <span>${escapeHtml(max)}</span>
        <b>${Math.round(safePercent)}%</b>
      </div>
    </div>
  `;
}

function contextValue(context) {
  const usedTokens = Number(context.totalInput || 0) + Number(context.totalOutput || 0);
  const totalTokens = Number(context.size || 0);
  if (usedTokens || totalTokens) return `${compactNumber(usedTokens)} / ${compactNumber(totalTokens)}`;
  return pct(context.usedPercentage);
}

function tokenPercent(tokens, context) {
  const total = Number(context.size || 0);
  const used = Number(tokens.liveInput || 0) + Number(tokens.liveOutput || 0);
  if (!total || !used) return Number(context.usedPercentage || 0);
  return (used / total) * 100;
}

function detailValue(value) {
  return escapeHtml(value || "--");
}

function renderPetView() {
  const state = model.state;
  const config = model.config;
  const status = state.status || {};
  const context = state.context || {};
  const tokens = state.tokens || {};
  const session = state.session || {};
  const cost = state.cost || {};
  const used = Math.max(0, Math.min(100, Number(context.usedPercentage || tokenPercent(tokens, context) || 0)));
  const cwdName = session.cwdName || "workspace";
  const activeSubagent = state.activeSubagent || null;
  const phase = phaseClass(status, activeSubagent);
  const usedLabel = contextValue(context);
  const ctxTone = used > 80 ? "danger" : used > 55 ? "warn" : "context";
  const detailText = status.detail || session.cwd || "";
  const task = taskStatusLine(status, activeSubagent);
  const pendingPermission = state.pendingPermission || null;
  const showSpeech = config.showPanel || pendingPermission;
  const permissionDetail = pendingPermission ? (pendingPermission.detail || detailText || "Claude Code needs permission.") : "";
  const sessionButtonDisabled = pendingPermission && !pendingPermission.canAutoApprove ? "disabled" : "";
  const autoYesLabel = state.permissionAutoYes ? "自动Yes中" : "自动Yes";
  $("#app").innerHTML = `
    <div class="pet-shell ${phase} ${model.ui.expanded ? "details-open" : ""}" data-pet-shell>
      <div class="pet-body">
        <div class="pet-stage" data-fit-host>
          <div class="hp ${ctxTone}">
            <div class="hp-head"><span>HP</span><strong>${pct(used)}</strong><b>${escapeHtml(usedLabel)}</b></div>
            <div class="hp-bar"><span style="width:${used}%"></span></div>
          </div>
          <div class="run-dust"></div>
          <div class="pixel-pet" data-pet></div>
          <div class="pet-shadow"></div>
          ${phase === "phase-done" ? '<div class="complete-burst">DONE</div>' : ""}
          ${phase === "phase-waiting" ? '<div class="attention-badge">!</div>' : ""}
        </div>
        <div class="speech ${status.attention ? "attention" : ""} ${pendingPermission ? "permission-pending" : ""}" ${model.ui.expanded || pendingPermission ? "data-clickable" : ""} ${showSpeech ? "" : 'style="display:none"'}>
          <button class="speech-toggle" data-clickable data-action="toggle-details" title="${model.ui.expanded ? "收起" : "展开"}">${model.ui.expanded ? "▴" : "▾"}</button>
          <div class="speech-head">
            <span class="hud-dot ${severityClass(status)}"></span>
            <span class="speech-model">${escapeHtml(cwdName)}</span>
            <span class="speech-task ${task.tone}">
              <span class="task-title">${escapeHtml(task.title)}</span>
              ${task.detail ? `<span class="task-detail">${escapeHtml(task.detail)}</span>` : ""}
            </span>
          </div>
          <div class="speech-output-label">${pendingPermission ? "权限请求" : "输出"}</div>
          <div class="speech-output" data-speech-output data-clickable>${escapeHtml(pendingPermission ? permissionDetail : detailText) || "Idle. Waiting for the next task."}</div>
          ${pendingPermission ? `
            <div class="permission-actions" data-clickable data-permission-id="${escapeHtml(pendingPermission.id)}">
              <button class="permission-button allow" data-permission-action="allow">Yes</button>
              <button class="permission-button deny" data-permission-action="deny">No</button>
              <button class="permission-button session" data-permission-action="allow_session" ${sessionButtonDisabled}>允许此类</button>
              <button class="permission-button auto" data-permission-action="auto_yes_session">${escapeHtml(autoYesLabel)}</button>
            </div>
          ` : ""}
          <div class="speech-details">
            <div class="detail-row"><span>输入 token</span><strong>${detailValue(compactNumber(tokens.sessionInput ?? tokens.liveInput))}</strong></div>
            <div class="detail-row"><span>输出 token</span><strong>${detailValue(compactNumber(tokens.sessionOutput ?? tokens.liveOutput))}</strong></div>
            <div class="detail-row"><span>会话</span><strong>${detailValue((session.id || "").slice(0, 8))}</strong></div>
            <div class="detail-row"><span>git</span><strong>${escapeHtml(gitText(state.git))}</strong></div>
            <div class="detail-row"><span>花费</span><strong>$${Number(cost.totalCostUsd || 0).toFixed(4)}</strong></div>
          </div>
          <div class="speech-actions">
            <button data-action="manager">${icon("settings", "设置")}</button>
            <button data-action="hide">${icon("eyeOff", "隐藏")}</button>
            <button data-action="quit">${icon("power", "关闭")}</button>
          </div>
        </div>
      </div>
      <div class="pet-context-menu" data-pet-context-menu data-clickable hidden role="menu" aria-label="桌宠菜单">
        <button data-context-action="manager" role="menuitem">${icon("settings", "设置")}</button>
        <button data-context-action="toggle-panel" role="menuitemcheckbox" aria-checked="${config.showPanel ? "true" : "false"}">${icon("panel", config.showPanel ? "隐藏消息框" : "显示消息框")}</button>
        <button data-context-action="hide" role="menuitem">${icon("eyeOff", "隐藏")}</button>
        <button data-context-action="close" role="menuitem">${icon("close", "关闭此宠物")}</button>
        <button class="danger" data-context-action="quit" role="menuitem">${icon("power", "退出 ClaudePet")}</button>
        <div class="pet-context-divider" role="separator"></div>
        <div class="pet-context-pets" data-clickable role="group" aria-label="切换形象">
          ${model.pets.map((p) => `
            <button class="pet-context-pet ${p.id === model.config.selectedPet ? "active" : ""}" data-context-pet="${escapeHtml(p.id)}" role="menuitemradio" aria-checked="${p.id === model.config.selectedPet}" title="${escapeHtml(p.displayName)}">
              <span class="pet-context-pet-thumb" data-context-thumb="${escapeHtml(p.id)}"></span>
            </button>
          `).join("")}
        </div>
      </div>
    </div>
  `;
  $("[data-action='manager']")?.addEventListener("click", () => runPetAction("manager"));
  $("[data-action='hide']")?.addEventListener("click", () => runPetAction("hide"));
  $("[data-action='quit']")?.addEventListener("click", () => runPetAction("close", { confirm: true }));
  document.querySelectorAll("[data-context-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.contextAction;
      if (action === "close" || action === "quit") return runPetAction(action, { confirm: true });
      runPetAction(action);
    });
  });
  document.querySelectorAll("[data-context-pet]").forEach((button) => {
    button.addEventListener("click", async () => {
      const petId = button.dataset.contextPet;
      if (!petId || petId === model.config.selectedPet) {
        hidePetContextMenu();
        return;
      }
      hidePetContextMenu();
      try {
        await window.claudepet.setSessionPet(petId);
      } catch (error) {
        // main process will broadcast back on success; failure is silent
      }
    });
  });
  document.querySelectorAll("[data-permission-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const container = button.closest("[data-permission-id]");
      const requestId = container && container.dataset.permissionId;
      const action = button.dataset.permissionAction;
      if (!requestId || !action) return;
      container.querySelectorAll("button").forEach((item) => {
        item.disabled = true;
      });
      try {
        await window.claudepet.respondPermission({ requestId, action });
      } catch (error) {
        container.querySelectorAll("button").forEach((item) => {
          item.disabled = false;
        });
      }
    });
  });
  $("[data-action='toggle-details']")?.addEventListener("click", () => {
    model.ui.expanded = !model.ui.expanded;
    render();
  });
}

function runPetAction(action, options = {}) {
  hidePetContextMenu();
  if (action === "manager") {
    window.claudepet.openManager();
  } else if (action === "toggle-panel") {
    window.claudepet.togglePanel();
  } else if (action === "hide") {
    window.claudepet.hidePet();
  } else if (action === "close") {
    if (options.confirm && !confirm("关闭这只桌宠？（其它会话不受影响）")) return;
    window.claudepet.closePet();
  } else if (action === "quit") {
    if (options.confirm && !confirm("退出 ClaudePet？所有桌宠都会关闭。")) return;
    window.claudepet.quitApp();
  }
}

const contextMenuState = { open: false };

function hidePetContextMenu() {
  const menu = $("[data-pet-context-menu]");
  if (menu) menu.hidden = true;
  contextMenuState.open = false;
}

function showPetContextMenu(event) {
  const menu = $("[data-pet-context-menu]");
  if (!menu) return;
  menu.hidden = false;
  menu.style.left = "0px";
  menu.style.top = "0px";
  const rect = menu.getBoundingClientRect();
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
  const left = Math.min(Math.max(margin, event.clientX), maxLeft);
  const top = Math.min(Math.max(margin, event.clientY), maxTop);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  contextMenuState.open = true;
  menu.querySelector("button")?.focus({ preventScroll: true });
}

function renderPetCards() {
  return model.pets
    .map(
      (pet) => `
      <button class="pet-card ${pet.id === model.config.selectedPet ? "active" : ""} ${pet.id === (model.selectedManagerPet || model.config.selectedPet) ? "focused" : ""}" data-pet-id="${escapeHtml(pet.id)}">
        <div class="pet-thumb" data-thumb="${escapeHtml(pet.id)}"></div>
        <div>
          <div class="pet-name">${escapeHtml(pet.displayName)}${pet.id === model.config.selectedPet ? ' <span class="pet-active-tag">使用中</span>' : ""}</div>
          <div class="pet-desc">${escapeHtml(pet.description)}</div>
        </div>
      </button>
    `
    )
    .join("");
}

function selectedManagerPet() {
  const id = model.selectedManagerPet || model.config.selectedPet;
  return model.pets.find((pet) => pet.id === id) || activePet();
}

const USAGE_RANGES = [
  { id: "today", label: "今日", key: "today" },
  { id: "7d", label: "7 天", key: "last7" },
  { id: "30d", label: "30 天", key: "last30" },
  { id: "all", label: "全部", key: "all" }
];

function formatTokens(value) {
  return compactNumber(Number(value || 0), "0");
}

function formatCost(value) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function formatDurationMs(ms) {
  const total = Number(ms || 0);
  if (!total) return "0m";
  const minutes = Math.floor(total / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function activeUsageStats() {
  const usage = model.usage;
  if (!usage) return null;
  const range = USAGE_RANGES.find((r) => r.id === model.usageRange) || USAGE_RANGES[0];
  return usage[range.key] || null;
}

function renderUsageSummary(stats) {
  if (!stats) return '<div class="usage-empty">尚未记录</div>';
  const total = stats.total || {};
  const cards = [
    { label: "输入", value: formatTokens(total.input), tone: "input", icon: "fields" },
    { label: "输出", value: formatTokens(total.output), tone: "output", icon: "spark" },
    { label: "缓存写", value: formatTokens(total.cacheCreation), tone: "cache", icon: "save" },
    { label: "缓存读", value: formatTokens(total.cacheRead), tone: "cache", icon: "folder" },
    { label: "花费", value: formatCost(total.cost), tone: "cost", icon: "chart" },
    { label: "用时", value: formatDurationMs(total.durationMs), tone: "duration", icon: "play" },
    { label: "会话数", value: number(total.sessions, "0"), tone: "session", icon: "panel" }
  ];
  return `
    <div class="usage-cards">
      ${cards.map((card) => `
        <div class="usage-card ${card.tone}">
          <span class="usage-card-label">${icon(card.icon)}${escapeHtml(card.label)}</span>
          <strong class="usage-card-value">${escapeHtml(String(card.value))}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderUsageProjects(stats) {
  if (!stats || !stats.byProject || stats.byProject.length === 0) {
    return '<div class="usage-empty">没有项目数据</div>';
  }
  const maxCost = Math.max(0.0001, ...stats.byProject.map((row) => Number(row.cost || 0)));
  return `
    <table class="usage-table">
      <thead><tr><th>项目</th><th>输入</th><th>输出</th><th>缓存读/写</th><th>花费</th><th>会话</th><th></th></tr></thead>
      <tbody>
        ${stats.byProject.map((row) => {
          const ratio = Math.max(0, Math.min(100, (Number(row.cost || 0) / maxCost) * 100));
          return `
            <tr>
              <td class="proj">${escapeHtml(row.projectKey)}</td>
              <td>${escapeHtml(formatTokens(row.input))}</td>
              <td>${escapeHtml(formatTokens(row.output))}</td>
              <td>${escapeHtml(formatTokens(row.cacheRead))} / ${escapeHtml(formatTokens(row.cacheCreation))}</td>
              <td>${escapeHtml(formatCost(row.cost))}</td>
              <td>${escapeHtml(number(row.sessions, "0"))}</td>
              <td class="bar-cell"><div class="usage-bar"><span style="width:${ratio.toFixed(1)}%"></span></div></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderUsageDays(stats) {
  if (!stats || !stats.byDay || stats.byDay.length === 0) {
    return '<div class="usage-empty">没有日数据</div>';
  }
  const recent = stats.byDay.slice(0, 30);
  const maxCost = Math.max(0.0001, ...recent.map((row) => Number(row.cost || 0)));
  return `
    <table class="usage-table">
      <thead><tr><th>日期</th><th>输入</th><th>输出</th><th>缓存读/写</th><th>花费</th><th>会话</th><th></th></tr></thead>
      <tbody>
        ${recent.map((row) => {
          const ratio = Math.max(0, Math.min(100, (Number(row.cost || 0) / maxCost) * 100));
          return `
            <tr>
              <td>${escapeHtml(row.dateKey)}</td>
              <td>${escapeHtml(formatTokens(row.input))}</td>
              <td>${escapeHtml(formatTokens(row.output))}</td>
              <td>${escapeHtml(formatTokens(row.cacheRead))} / ${escapeHtml(formatTokens(row.cacheCreation))}</td>
              <td>${escapeHtml(formatCost(row.cost))}</td>
              <td>${escapeHtml(number(row.sessions, "0"))}</td>
              <td class="bar-cell"><div class="usage-bar"><span style="width:${ratio.toFixed(1)}%"></span></div></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderUsageSection() {
  const config = model.config;
  const enabled = !(config.stats && config.stats.enabled === false);
  const retentionDays = (config.stats && Number(config.stats.retentionDays)) || 0;
  const stats = enabled ? activeUsageStats() : null;
  const tabs = USAGE_RANGES.map((range) => `
    <button class="usage-tab ${range.id === model.usageRange ? "active" : ""}" data-usage-range="${range.id}">${escapeHtml(range.label)}</button>
  `).join("");
  return `
    <section class="section usage-section">
      ${sectionTitle("chart", "使用统计")}
      <div class="usage-controls">
        <label class="toggle with-toggle-icon">${icon("chart")}<input type="checkbox" ${enabled ? "checked" : ""} data-config-bool="stats.enabled"> <span>开启统计</span></label>
        <label class="usage-retention">${icon("clock")}<span>保留天数</span><input type="number" min="0" max="3650" value="${retentionDays}" data-config-number="stats.retentionDays"></label>
        <button class="with-icon" data-action="refresh-usage" ${model.usageLoading ? "disabled" : ""}>${icon("refresh", model.usageLoading ? "加载中…" : "刷新")}</button>
      </div>
      ${enabled ? `
        <div class="usage-tabs">${tabs}</div>
        ${renderUsageSummary(stats)}
        <h3 class="usage-subtitle">分项目</h3>
        ${renderUsageProjects(stats)}
        <h3 class="usage-subtitle">分日期</h3>
        ${renderUsageDays(stats)}
      ` : '<div class="usage-empty">已关闭统计。开启后从下一次 statusLine 事件起累计。</div>'}
    </section>
  `;
}

const MANAGER_TABS = [
  { id: "pets", label: "宠物", icon: "pet" },
  { id: "appearance", label: "显示设置", icon: "palette" },
  { id: "usage", label: "使用统计", icon: "chart" }
];

function renderManagerNav() {
  return `
    <header class="manager-header">
      <div class="manager-brand">
        <img class="manager-brand-icon" src="./assets/app-icon-64.png" alt="">
        <div class="manager-brand-copy">
          <h1 class="title">ClaudePet</h1>
          <p class="subtitle">Claude Code 桌宠设置中心</p>
        </div>
      </div>
      <nav class="manager-nav">
        ${MANAGER_TABS.map((tab) => `
          <button class="manager-tab ${tab.id === model.managerTab ? "active" : ""}" data-manager-tab="${tab.id}" aria-pressed="${tab.id === model.managerTab}" title="${escapeHtml(tab.label)}">${icon(tab.icon, tab.label)}</button>
        `).join("")}
      </nav>
    </header>
  `;
}

const ANIMATION_META = [
  { key: "idle", label: "idle 空闲", trigger: "Claude 没在做事时（默认状态）", icon: "pet" },
  { key: "thinking", label: "thinking 思考", trigger: "Claude 读取 prompt、压缩上下文（compact）时", icon: "spark" },
  { key: "tool", label: "tool 工具", trigger: "运行工具、子代理、任务创建 / 完成时", icon: "settings" },
  { key: "waiting", label: "waiting 等待", trigger: "等待你授权权限或回复输入时", icon: "bell" },
  { key: "success", label: "success 成功", trigger: "Claude 完成一轮回复时（一次性，不循环）", icon: "check" },
  { key: "error", label: "error 错误", trigger: "工具失败或会话出错时", icon: "alert" },
  { key: "run", label: "run 奔跑", trigger: "你拖动桌宠窗口时", icon: "play" }
];

function renderPetsTab(pet) {
  const anchor = pet.anchor || { x: 0.5, y: 1 };
  return `
    <section class="section">
      ${sectionTitle("pet", "选择宠物")}
      <div class="pet-grid">${renderPetCards()}</div>
    </section>

    <section class="section">
      ${sectionTitle("image", "预览")}
      <div class="preview-strip">
        <div class="big-preview" data-preview></div>
        <div class="status-note">
          <strong>${escapeHtml(pet.displayName)}</strong><br>
          精灵图 ${escapeHtml(pet.imageWidth)}×${escapeHtml(pet.imageHeight)} px，
          切成 ${escapeHtml(pet.columns)} 列 × ${escapeHtml(pet.rows)} 行；每帧 ${escapeHtml(pet.frameWidth)}×${escapeHtml(pet.frameHeight)} px<br>
          状态动画：idle / thinking / tool / waiting / success / error / run
        </div>
      </div>
    </section>

    <section class="section">
      ${sectionTitle("fields", "基础信息")}
      <p class="section-hint">这些字段写进 <code>pet/&lt;id&gt;/pet.json</code>。ID 由文件夹名决定，不可改。</p>
      <div class="form-grid">
        <div class="field">
          <label>${icon("tag", "ID")}</label>
          <input value="${escapeHtml(pet.id)}" disabled>
          <span class="field-hint">宠物文件夹名，作为唯一标识</span>
        </div>
        <div class="field">
          <label>${icon("text", "显示名")}</label>
          <input value="${escapeHtml(pet.displayName)}" data-manifest-text="displayName">
          <span class="field-hint">对应 manifest 里的 <code>displayName</code></span>
        </div>
        <div class="field" style="grid-column: 1 / -1">
          <label>${icon("fields", "描述")}</label>
          <input value="${escapeHtml(pet.description)}" data-manifest-text="description">
          <span class="field-hint">对应 manifest 里的 <code>description</code></span>
        </div>
        <div class="field">
          <label>${icon("folder", "类型")}</label>
          <input value="${escapeHtml(pet.kind)}" data-manifest-text="kind">
          <span class="field-hint">分类标签，例如 character / mascot，目前仅作为元数据</span>
        </div>
      </div>
    </section>

    <section class="section">
      ${sectionTitle("grid", "精灵图帧切分")}
      <p class="section-hint">桌宠是一张大图按网格切成的小帧。下面参数告诉程序怎么切。当前图片尺寸 <strong>${escapeHtml(pet.imageWidth)}×${escapeHtml(pet.imageHeight)} px</strong>，理论上应满足 <code>frameWidth × columns ≤ 图宽</code> 且 <code>frameHeight × rows ≤ 图高</code>。</p>
      <div class="form-grid">
        <div class="field">
          <label>${icon("ruler", "单帧宽度（px）")}</label>
          <input type="number" min="1" step="1" value="${pet.frameWidth}" data-manifest-number="frameWidth">
          <span class="field-hint">每个动画帧的像素宽度</span>
        </div>
        <div class="field">
          <label>${icon("ruler", "单帧高度（px）")}</label>
          <input type="number" min="1" step="1" value="${pet.frameHeight}" data-manifest-number="frameHeight">
          <span class="field-hint">每个动画帧的像素高度</span>
        </div>
        <div class="field">
          <label>${icon("columns", "横向帧数")}</label>
          <input type="number" min="1" step="1" value="${pet.columns}" data-manifest-number="columns">
          <span class="field-hint">网格列数，决定 frame 索引怎么换算 x 坐标</span>
        </div>
        <div class="field">
          <label>${icon("grid", "纵向帧数")}</label>
          <input type="number" min="1" step="1" value="${pet.rows}" data-manifest-number="rows">
          <span class="field-hint">网格行数，决定最大可用帧 = columns × rows</span>
        </div>
        <div class="field">
          <label>${icon("zoom", "预览放大倍数")}</label>
          <input type="number" min="0.1" max="8" step="0.01" value="${pet.defaultScale}" data-manifest-number="defaultScale">
          <span class="field-hint">仅影响 Manager 大预览。桌宠窗口的缩放在「外观」标签里调</span>
        </div>
        <div class="field">
          <label>${icon("anchor", "锚点 X（0~1）")}</label>
          <input type="number" min="0" max="1" step="0.01" value="${anchor.x}" data-manifest-anchor="x">
          <span class="field-hint">渲染锚点横向位置：0=左边，0.5=居中，1=右边</span>
        </div>
        <div class="field">
          <label>${icon("anchor", "锚点 Y（0~1）")}</label>
          <input type="number" min="0" max="1" step="0.01" value="${anchor.y}" data-manifest-anchor="y">
          <span class="field-hint">渲染锚点纵向位置：0=顶，1=底（脚踩地面通常用 1）</span>
        </div>
      </div>
    </section>

    <section class="section">
      ${sectionTitle("play", "动画")}
      <p class="section-hint"><strong>frames</strong> = 这个动画用网格里第几帧（从 0 开始，逗号分隔，按顺序播放）。<strong>fps</strong> = 每秒播多少帧。<strong>loop</strong> = 是否循环。</p>
      <div class="anim-list">
        ${ANIMATION_META.map((meta) => renderAnimationRow(meta, pet.animations[meta.key])).join("")}
      </div>
    </section>

    <div class="save-bar">
      <button class="with-icon" data-action="save-manifest">${icon("save", "保存 manifest")}</button>
      <span class="save-status" data-save-status data-tone="${escapeHtml(manifestSaveFlash.tone)}">${escapeHtml(manifestSaveFlash.text)}</span>
    </div>
  `;
}

function renderAnimationRow(meta, anim) {
  const safe = anim || { frames: [], fps: 8, loop: true };
  const framesStr = (safe.frames || []).join(", ");
  return `
    <div class="anim-row">
      <div class="anim-head">
        <strong>${icon(meta.icon)}${escapeHtml(meta.label)}</strong>
        <span class="anim-trigger">${escapeHtml(meta.trigger)}</span>
      </div>
      <div class="anim-fields">
        <div class="field anim-frames">
          <label>${icon("grid", "frames")}</label>
          <input value="${escapeHtml(framesStr)}" data-anim="${escapeHtml(meta.key)}" data-anim-key="frames" placeholder="0, 1, 2, 3">
        </div>
        <div class="field anim-fps">
          <label>${icon("clock", "fps")}</label>
          <input type="number" min="1" max="60" step="1" value="${safe.fps}" data-anim="${escapeHtml(meta.key)}" data-anim-key="fps">
        </div>
        <label class="toggle with-toggle-icon anim-loop">
          ${icon("refresh")}
          <input type="checkbox" ${safe.loop ? "checked" : ""} data-anim="${escapeHtml(meta.key)}" data-anim-key="loop">
          <span>循环</span>
        </label>
      </div>
    </div>
  `;
}

const FIELD_LABELS = {
  session: { label: "会话", icon: "panel" },
  context: { label: "上下文", icon: "chart" },
  git: { label: "Git 状态", icon: "folder" },
  tokens: { label: "Token", icon: "fields" },
  task: { label: "任务", icon: "play" },
  cost: { label: "花费", icon: "spark" }
};

function renderFieldToggle(key, checked) {
  const meta = FIELD_LABELS[key] || { label: key, icon: "fields" };
  return `<label class="toggle with-toggle-icon">${icon(meta.icon)}<input type="checkbox" ${checked ? "checked" : ""} data-field="${escapeHtml(key)}"> <span>${escapeHtml(meta.label)}</span></label>`;
}

function renderAppearanceTab(config) {
  const theme = config.theme === "light" ? "light" : "dark";
  return `
    <section class="section">
      ${sectionTitle("palette", "主题")}
      <div class="theme-switcher" role="radiogroup" aria-label="主题模式">
        <button class="theme-option ${theme === "dark" ? "active" : ""}" data-config-theme="dark" role="radio" aria-checked="${theme === "dark"}">
          ${icon("eyeOff", "暗色")}
        </button>
        <button class="theme-option ${theme === "light" ? "active" : ""}" data-config-theme="light" role="radio" aria-checked="${theme === "light"}">
          ${icon("spark", "亮色")}
        </button>
      </div>
    </section>

    <section class="section">
      ${sectionTitle("palette", "显示设置")}
      <div class="form-grid">
        <div class="field range-field">
          <label>${icon("pet", "桌宠大小")}</label>
          <input type="range" min="0.32" max="1.1" step="0.01" value="${config.scale}" data-config-number="scale">
          <span class="field-hint">当前 ${Math.round(Number(config.scale) * 100)}%</span>
        </div>
        <div class="field range-field">
          <label>${icon("panel", "窗口不透明度")}</label>
          <input type="range" min="0.35" max="1" step="0.01" value="${config.opacity}" data-config-number="opacity">
          <span class="field-hint">当前 ${Math.round(Number(config.opacity) * 100)}%</span>
        </div>
        <label class="toggle with-toggle-icon">${icon("pin")}<input type="checkbox" ${config.alwaysOnTop ? "checked" : ""} data-config-bool="alwaysOnTop"> <span>总在最前</span></label>
        <label class="toggle with-toggle-icon">${icon("panel")}<input type="checkbox" ${config.showPanel ? "checked" : ""} data-config-bool="showPanel"> <span>显示气泡面板</span></label>
        <label class="toggle with-toggle-icon">${icon("bell")}<input type="checkbox" ${config.notifications.system ? "checked" : ""} data-config-bool="notifications.system"> <span>系统通知</span></label>
        <label class="toggle with-toggle-icon">${icon("spark")}<input type="checkbox" ${config.notifications.flashWindow ? "checked" : ""} data-config-bool="notifications.flashWindow"> <span>需要注意时闪烁窗口</span></label>
      </div>
    </section>

    <section class="section">
      ${sectionTitle("fields", "气泡详情字段")}
      <div class="toggle-grid">
        ${Object.keys(config.fields)
          .map((key) => renderFieldToggle(key, config.fields[key]))
          .join("")}
      </div>
    </section>
  `;
}

function renderManagerView() {
  const config = model.config;
  const pet = selectedManagerPet();
  const tab = model.managerTab || "pets";
  let body = "";
  if (tab === "pets") body = renderPetsTab(pet);
  else if (tab === "appearance") body = renderAppearanceTab(config);
  else if (tab === "usage") body = renderUsageSection();
  $("#app").innerHTML = `
    <div class="manager">
      ${renderManagerNav()}
      <main class="manager-content" data-manager-tab-content="${tab}">
        ${body}
      </main>
    </div>
  `;
  attachManagerNavEvents();
  attachManagerEvents();
  if (tab === "usage") attachUsageEvents();
}

function attachManagerNavEvents() {
  document.querySelectorAll("[data-manager-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.managerTab;
      if (next === model.managerTab) return;
      model.managerTab = next;
      renderManagerView();
      drawCurrentFrame();
      if (next === "usage" && !model.usage && !model.usageLoading) refreshUsage();
    });
  });
}

async function refreshUsage() {
  if (model.usageLoading) return;
  model.usageLoading = true;
  try {
    const usage = await window.claudepet.getUsage();
    model.usage = usage && !usage.error ? usage : null;
  } catch (error) {
    model.usage = null;
  } finally {
    model.usageLoading = false;
    if (view === "manager") renderManagerView();
  }
}

function attachUsageEvents() {
  document.querySelectorAll("[data-usage-range]").forEach((button) => {
    button.addEventListener("click", () => {
      model.usageRange = button.dataset.usageRange;
      renderManagerView();
    });
  });
  $("[data-action='refresh-usage']")?.addEventListener("click", () => {
    refreshUsage();
  });
}

function setDeep(object, path, value) {
  const parts = path.split(".");
  let current = object;
  for (const part of parts.slice(0, -1)) {
    current[part] = current[part] || {};
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

function attachManagerEvents() {
  document.querySelectorAll("[data-pet-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = button.dataset.petId;
      model.selectedManagerPet = id;
      const next = await window.claudepet.updateConfig({ selectedPet: id });
      Object.assign(model, next);
      model.selectedManagerPet = id;
      render();
    });
  });
  document.querySelectorAll("[data-config-number]").forEach((input) => {
    input.addEventListener("input", async () => {
      const patch = {};
      setDeep(patch, input.dataset.configNumber, Number(input.value));
      Object.assign(model, await window.claudepet.updateConfig(patch));
      drawCurrentFrame();
    });
  });
  document.querySelectorAll("[data-config-bool]").forEach((input) => {
    input.addEventListener("change", async () => {
      const patch = {};
      setDeep(patch, input.dataset.configBool, input.checked);
      Object.assign(model, await window.claudepet.updateConfig(patch));
    });
  });
  document.querySelectorAll("[data-config-theme]").forEach((button) => {
    button.addEventListener("click", async () => {
      const theme = button.dataset.configTheme === "light" ? "light" : "dark";
      if (model.config && model.config.theme === theme) return;
      Object.assign(model, await window.claudepet.updateConfig({ theme }));
      applyTheme(theme);
      renderManagerView();
      drawCurrentFrame();
    });
  });
  document.querySelectorAll("[data-field]").forEach((input) => {
    input.addEventListener("change", async () => {
      const fields = { ...model.config.fields, [input.dataset.field]: input.checked };
      Object.assign(model, await window.claudepet.updateConfig({ fields }));
    });
  });
  $("[data-action='save-manifest']")?.addEventListener("click", async () => {
    try {
      const pet = selectedManagerPet();
      const patch = collectManifestPatch();
      setManifestSaveFlash("保存中…", "work");
      await window.claudepet.savePetManifest(pet.id, patch);
      setManifestSaveFlash("已保存", "ok");
    } catch (error) {
      setManifestSaveFlash(error && error.message ? error.message : String(error), "error");
    }
  });
}

function collectManifestPatch() {
  const patch = {};
  document.querySelectorAll("[data-manifest-number]").forEach((input) => {
    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      throw new Error(`「${input.previousElementSibling?.textContent || input.dataset.manifestNumber}」必须是数字`);
    }
    patch[input.dataset.manifestNumber] = value;
  });
  document.querySelectorAll("[data-manifest-text]").forEach((input) => {
    patch[input.dataset.manifestText] = input.value;
  });
  const anchorInputs = document.querySelectorAll("[data-manifest-anchor]");
  if (anchorInputs.length) {
    const anchor = {};
    anchorInputs.forEach((input) => {
      const value = Number(input.value);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`Anchor ${input.dataset.manifestAnchor} 必须在 0~1 之间`);
      }
      anchor[input.dataset.manifestAnchor] = value;
    });
    patch.anchor = anchor;
  }
  const animKeys = new Set();
  document.querySelectorAll("[data-anim]").forEach((node) => animKeys.add(node.dataset.anim));
  if (animKeys.size) {
    const animations = {};
    for (const key of animKeys) {
      const framesInput = document.querySelector(`[data-anim="${key}"][data-anim-key="frames"]`);
      const fpsInput = document.querySelector(`[data-anim="${key}"][data-anim-key="fps"]`);
      const loopInput = document.querySelector(`[data-anim="${key}"][data-anim-key="loop"]`);
      const frames = parseFrameList(framesInput ? framesInput.value : "", key);
      if (!frames.length) throw new Error(`动画「${key}」至少要有 1 帧`);
      const fps = Number(fpsInput ? fpsInput.value : 8);
      if (!Number.isFinite(fps) || fps <= 0) throw new Error(`动画「${key}」fps 必须是正数`);
      animations[key] = { frames, fps, loop: !!(loopInput && loopInput.checked) };
    }
    patch.animations = animations;
  }
  return patch;
}

function parseFrameList(input, animKey) {
  const cleaned = String(input || "").trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  const frames = [];
  for (const raw of parts) {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`动画「${animKey}」frames 含非法值「${raw}」（需要 0 起始的整数索引）`);
    }
    frames.push(value);
  }
  return frames;
}

function captureOutputScroll() {
  const node = document.querySelector("[data-speech-output]");
  if (!node) return null;
  return { scrollTop: node.scrollTop };
}

function restoreOutputScroll(snapshot) {
  if (!snapshot) return;
  const node = document.querySelector("[data-speech-output]");
  if (!node) return;
  node.scrollTop = snapshot.scrollTop;
}

const FOCUS_DATA_KEYS = [
  "manifestNumber",
  "manifestText",
  "manifestAnchor",
  "anim",
  "configNumber",
  "configBool",
  "field",
  "managerTab",
  "petId"
];

function selectorForDataset(node) {
  const ds = node.dataset || {};
  for (const key of FOCUS_DATA_KEYS) {
    if (ds[key] == null) continue;
    const attr = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    const value = String(ds[key]).replace(/"/g, '\\"');
    let selector = `[data-${attr}="${value}"]`;
    if (key === "anim" && ds.animKey) {
      selector += `[data-anim-key="${ds.animKey}"]`;
    }
    return selector;
  }
  return null;
}

function captureManagerSnapshot() {
  const root = document.querySelector(".manager-content");
  const snapshot = {
    scrollTop: root ? root.scrollTop : 0,
    focus: null,
    fields: []
  };
  if (!root) return snapshot;
  root.querySelectorAll("input, textarea, select").forEach((node) => {
    if (node.disabled) return;
    const selector = selectorForDataset(node);
    if (!selector) return;
    const entry = { selector };
    if (node.type === "checkbox" || node.type === "radio") {
      entry.checked = node.checked;
    } else {
      entry.value = node.value;
    }
    snapshot.fields.push(entry);
  });
  const active = document.activeElement;
  if (active && active !== document.body && root.contains(active)) {
    const selector = selectorForDataset(active);
    if (selector) {
      const focus = { selector };
      if (typeof active.selectionStart === "number") {
        focus.selectionStart = active.selectionStart;
        focus.selectionEnd = active.selectionEnd;
      }
      snapshot.focus = focus;
    }
  }
  return snapshot;
}

function restoreManagerSnapshot(snapshot) {
  if (!snapshot) return;
  const root = document.querySelector(".manager-content");
  if (root) root.scrollTop = snapshot.scrollTop;
  for (const entry of snapshot.fields || []) {
    const target = document.querySelector(entry.selector);
    if (!target) continue;
    if ("checked" in entry) {
      if (target.checked !== entry.checked) target.checked = entry.checked;
    } else if (target.value !== entry.value) {
      target.value = entry.value;
    }
  }
  if (snapshot.focus) {
    const target = document.querySelector(snapshot.focus.selector);
    if (target) {
      target.focus({ preventScroll: true });
      if (typeof snapshot.focus.selectionStart === "number" && typeof target.setSelectionRange === "function") {
        try {
          target.setSelectionRange(snapshot.focus.selectionStart, snapshot.focus.selectionEnd);
        } catch (_) {
          // setSelectionRange unsupported on this input type
        }
      }
    }
  }
}

function render() {
  if (!model.state || !model.config) return;
  const outputSnapshot = view === "pet" ? captureOutputScroll() : null;
  const managerSnapshot = view === "manager" ? captureManagerSnapshot() : null;
  // Pet view re-renders replace the context menu DOM with the default hidden state;
  // keep our open-flag in sync so passthrough doesn't stay locked off.
  if (view === "pet") contextMenuState.open = false;
  if (view === "manager") renderManagerView();
  else renderPetView();
  drawCurrentFrame();
  restoreOutputScroll(outputSnapshot);
  restoreManagerSnapshot(managerSnapshot);
}

function drawCurrentFrame(now = performance.now()) {
  const pet = view === "manager" ? selectedManagerPet() : activePet();
  if (!pet) return;
  const animation = animationFor(pet);
  const fps = animation.fps || model.config.animationFps || 8;
  if (now - model.lastFrameAt > 1000 / fps) {
    model.lastFrameAt = now;
    model.frame = (model.frame + 1) % animation.frames.length;
  }
  const frame = animation.frames[model.frame] ?? 0;
  const petElement = $("[data-pet]");
  if (petElement) {
    petElement.classList.toggle("flip", model.drag.active && model.drag.direction === "left");
    petElement.classList.toggle("running", model.drag.active);
  }
  applyFrame(petElement, pet, frame, model.config.scale, { fit: true });
  applyFrame($("[data-preview]"), pet, frame, pet.defaultScale || 3);
  for (const thumb of document.querySelectorAll("[data-thumb]")) {
    const thumbPet = model.pets.find((candidate) => candidate.id === thumb.dataset.thumb);
    applyFrame(thumb, thumbPet, 0, 0.25);
  }
  for (const thumb of document.querySelectorAll("[data-context-thumb]")) {
    const thumbPet = model.pets.find((candidate) => candidate.id === thumb.dataset.contextThumb);
    applyFrame(thumb, thumbPet, 0, 0.18);
  }
}

const passthroughState = { ignoring: true };

function isInteractiveTarget(x, y) {
  const stack = document.elementsFromPoint(x, y);
  for (const node of stack) {
    if (!node || !(node instanceof Element)) continue;
    if (node.closest("[data-pet], [data-clickable], [data-pet-context-menu]")) return true;
  }
  return false;
}

function setPassthrough(ignore) {
  const next = contextMenuState.open ? false : ignore;
  if (passthroughState.ignoring === next) return;
  passthroughState.ignoring = next;
  if (window.claudepet && typeof window.claudepet.setPassthrough === "function") {
    window.claudepet.setPassthrough(next);
  }
}

function installDragHandlers() {
  window.addEventListener("contextmenu", (event) => {
    if (view !== "pet") return;
    const onMenu = event.target.closest("[data-pet-context-menu]");
    if (onMenu) {
      event.preventDefault();
      return;
    }
    const onPet = event.target.closest("[data-pet], .pet-stage");
    if (!onPet) return;
    event.preventDefault();
    model.drag.active = false;
    setPassthrough(false);
    showPetContextMenu(event);
  });

  window.addEventListener("pointermove", (event) => {
    if (view !== "pet") return;
    if (model.drag.active) {
      const dx = event.screenX - model.drag.lastScreenX;
      const dy = event.screenY - model.drag.lastScreenY;
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        if (Math.abs(dx) > 1) model.drag.direction = dx < 0 ? "left" : "right";
        model.drag.lastScreenX = event.screenX;
        model.drag.lastScreenY = event.screenY;
        window.claudepet.dragWindow({ dx, dy });
      }
      return;
    }
    const interactive = isInteractiveTarget(event.clientX, event.clientY);
    setPassthrough(!interactive);
  });

  window.addEventListener("pointerdown", (event) => {
    if (view !== "pet") return;
    const onMenu = event.target.closest("[data-pet-context-menu]");
    if (!onMenu) hidePetContextMenu();
    if (onMenu) return;
    if (event.button !== 0) return;
    const onPet = event.target.closest("[data-pet], .pet-stage");
    const onClickable = event.target.closest("[data-clickable]");
    if (!onPet && !onClickable) return;
    if (event.target.closest("button, input, textarea, select")) return;
    if (!onPet) return;
    model.drag.active = true;
    model.drag.lastScreenX = event.screenX;
    model.drag.lastScreenY = event.screenY;
    event.preventDefault();
    window.setPointerCapture?.(event.pointerId);
  });

  window.addEventListener("pointerup", () => {
    model.drag.active = false;
  });
  window.addEventListener("pointercancel", () => {
    model.drag.active = false;
  });
  window.addEventListener("pointerleave", () => {
    if (!model.drag.active) setPassthrough(true);
  });
  window.addEventListener("keydown", (event) => {
    if (view === "pet" && event.key === "Escape") hidePetContextMenu();
  });
  window.addEventListener("blur", () => {
    if (view === "pet") hidePetContextMenu();
  });
}

function applyTheme(theme) {
  const root = document.documentElement;
  root.classList.remove("theme-light", "theme-dark");
  root.classList.add(theme === "light" ? "theme-light" : "theme-dark");
}

async function init() {
  Object.assign(model, await window.claudepet.getInitial());
  applyTheme(model.config && model.config.theme);
  model.selectedManagerPet = model.config.selectedPet;
  installDragHandlers();
  render();
  if (view === "manager") refreshUsage();
  window.claudepet.onUpdate((payload) => {
    Object.assign(model, payload);
    applyTheme(model.config && model.config.theme);
    render();
  });
  function tick(now) {
    drawCurrentFrame(now);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

init().catch((error) => {
  $("#app").innerHTML = `<pre style="background:#191d24;color:#ff8a7a;padding:16px">${escapeHtml(error.stack || error)}</pre>`;
});
