const path = require("node:path");
const { getGitInfo } = require("./git");
const { readTranscriptUsage, readLatestAssistantText } = require("./transcript");

function coalesce(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function basename(value) {
  return value ? path.basename(value) : "";
}

function shortenCommand(command) {
  const text = String(command || "").trim();
  if (!text) return "";
  const collapsed = text.replace(/\s+/g, " ");
  const stripped = collapsed.replace(/^cd\s+\S+\s*(?:&&|;)\s*/i, "");
  return stripped.length > 70 ? `${stripped.slice(0, 67)}…` : stripped;
}

function shortenPath(value) {
  if (!value) return "";
  const text = String(value);
  const name = path.basename(text) || text;
  return name.length > 60 ? `${name.slice(0, 57)}…` : name;
}

function shortenHost(url) {
  try {
    return new URL(String(url)).hostname || String(url);
  } catch {
    return String(url || "").slice(0, 60);
  }
}

function shortenText(value, max = 160) {
  const text = String(value || "").trim();
  if (!text) return "";
  const firstLine = text.split(/\r?\n/, 1)[0].trim() || text;
  const collapsed = firstLine.replace(/\s+/g, " ");
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

function shortenMultiline(value, max = 600) {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
  return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function describeTool(input) {
  const rawTool = input.tool_name || "";
  const toolInput = input.tool_input || {};
  const tool = rawTool || "tool";
  switch (rawTool) {
    case "Bash":
    case "PowerShell": {
      const command = shortenCommand(toolInput.command);
      return { tool: rawTool, target: command, summary: command ? `Running: ${command}` : "Running shell command" };
    }
    case "Edit":
    case "MultiEdit": {
      const target = shortenPath(toolInput.file_path);
      return { tool: rawTool, target, summary: target ? `Editing ${target}` : "Editing file" };
    }
    case "Write": {
      const target = shortenPath(toolInput.file_path);
      return { tool: rawTool, target, summary: target ? `Writing ${target}` : "Writing file" };
    }
    case "Read": {
      const target = shortenPath(toolInput.file_path);
      return { tool: rawTool, target, summary: target ? `Reading ${target}` : "Reading file" };
    }
    case "Grep": {
      const pattern = shortenText(toolInput.pattern, 60);
      return { tool: rawTool, target: pattern, summary: pattern ? `Searching for "${pattern}"` : "Searching code" };
    }
    case "Glob": {
      const pattern = shortenText(toolInput.pattern, 60);
      return { tool: rawTool, target: pattern, summary: pattern ? `Finding ${pattern}` : "Finding files" };
    }
    case "Task": {
      const target = toolInput.subagent_type || "subagent";
      return { tool: rawTool, target, summary: `Delegating to ${target}` };
    }
    case "WebFetch": {
      const target = toolInput.url ? shortenHost(toolInput.url) : "";
      return { tool: rawTool, target, summary: target ? `Fetching ${target}` : "Fetching URL" };
    }
    case "WebSearch": {
      const target = shortenText(toolInput.query, 80);
      return { tool: rawTool, target, summary: target ? `Web search: ${target}` : "Web search" };
    }
    case "TodoWrite":
      return { tool: rawTool, target: "", summary: "Updating task list" };
    case "NotebookEdit": {
      const target = shortenPath(toolInput.notebook_path);
      return { tool: rawTool, target, summary: target ? `Editing notebook ${target}` : "Editing notebook" };
    }
    case "":
      return { tool: "", target: "", summary: "" };
    default: {
      const raw = toolInput.command || toolInput.file_path || toolInput.path || toolInput.url || toolInput.pattern || "";
      let target = "";
      if (!raw) return { tool, target: "", summary: `Using ${tool}` };
      if (toolInput.url) target = shortenHost(toolInput.url);
      else if (toolInput.command) target = shortenCommand(toolInput.command);
      else target = shortenPath(raw);
      return { tool, target, summary: `${tool}: ${target}` };
    }
  }
}

function summarizeTool(input) {
  return describeTool(input).summary;
}

function summarizeOutput(input) {
  const candidates = [
    input.last_assistant_message,
    input.message,
    input.output,
    input.result,
    input.tool_output,
    input.tool_response,
    input.error_details,
    input.error
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === "string") {
      const text = shortenText(candidate, 180);
      if (text) return text;
    }
  }
  return "";
}

function statusFromHook(input = {}) {
  const event = input.hook_event_name || "Hook";
  const base = {
    source: "hook",
    event,
    updatedAt: new Date().toISOString(),
    attention: false,
    severity: "info",
    animation: "thinking",
    label: event,
    detail: ""
  };
  const liveAssistant = event === "UserPromptSubmit" ? "" : shortenMultiline(readLatestAssistantText(input.transcript_path), 600);

  const result = (() => {
  switch (event) {
    case "UserPromptSubmit":
      return { ...base, kind: "thinking", label: "Reading prompt", detail: input.prompt ? input.prompt.slice(0, 120) : "", animation: "thinking" };
    case "PermissionRequest":
      return { ...base, kind: "waiting-permission", label: "Awaiting confirmation", detail: summarizeTool(input), attention: true, severity: "warning", animation: "waiting" };
    case "Notification":
      return {
        ...base,
        kind: input.notification_type === "idle_prompt" ? "waiting-input" : "notification",
        label: input.title || (input.notification_type === "permission_prompt" ? "Permission prompt" : "Claude needs attention"),
        detail: input.message || input.notification_type || "",
        attention: ["permission_prompt", "idle_prompt", "elicitation_dialog"].includes(input.notification_type),
        severity: input.notification_type === "permission_prompt" ? "warning" : "info",
        animation: "waiting"
      };
    case "PreToolUse": {
      const info = describeTool(input);
      const toolName = info.tool || "tool";
      return { ...base, kind: "running-tool", label: `Running ${toolName}`, detail: info.summary, tool: toolName, target: info.target, animation: "tool" };
    }
    case "PostToolUse": {
      const info = describeTool(input);
      const toolName = info.tool || "Tool";
      return { ...base, kind: "tool-complete", label: `${toolName} finished`, detail: summarizeOutput(input) || info.summary, tool: toolName, target: info.target, animation: "tool" };
    }
    case "PostToolUseFailure": {
      const info = describeTool(input);
      const toolName = info.tool || "Tool";
      return { ...base, kind: "tool-error", label: `${toolName} failed`, detail: summarizeOutput(input) || info.summary, tool: toolName, target: info.target, severity: "error", animation: "error", attention: true };
    }
    case "PostToolBatch":
      return { ...base, kind: "tool-batch", label: "Tool batch updated", detail: input.message || "", animation: "tool" };
    case "SubagentStart": {
      const type = input.agent_type || input.subagent_type || (input.tool_input && input.tool_input.subagent_type) || input.agent_id || "agent";
      return { ...base, kind: "subagent-running", label: "Subagent running", detail: type, animation: "tool", subagentType: type };
    }
    case "SubagentStop": {
      const type = input.agent_type || input.subagent_type || input.agent_id || "";
      return { ...base, kind: "subagent-complete", label: "Subagent finished", detail: summarizeOutput(input) || type, animation: "tool", subagentType: type, subagentEnded: true };
    }
    case "TaskCreated":
      return { ...base, kind: "task-created", label: "Task created", detail: input.task_subject || input.task_id || "", animation: "tool" };
    case "TaskCompleted":
      return { ...base, kind: "task-completed", label: "Task completed", detail: summarizeOutput(input) || input.task_subject || input.task_id || "", animation: "tool" };
    case "Stop":
      return { ...base, kind: "completed", label: "Claude finished", detail: summarizeOutput(input), animation: "success", attention: true };
    case "StopFailure":
      return { ...base, kind: "error", label: "Claude stopped with an error", detail: input.error_details || input.error || "", severity: "error", animation: "error", attention: true };
    case "PreCompact":
      return { ...base, kind: "compacting", label: "Compacting context", detail: input.trigger || "", animation: "thinking" };
    case "PostCompact":
      return { ...base, kind: "compacted", label: "Context compacted", detail: input.compact_summary ? input.compact_summary.slice(0, 180) : input.trigger || "", animation: "thinking" };
    default:
      return { ...base, kind: "activity", label: event, detail: summarizeTool(input), animation: "thinking" };
  }
  })();
  if (liveAssistant) return { ...result, detail: liveAssistant };
  return result;
}

function buildStatusLineState(input = {}) {
  const cwd = coalesce(input.workspace && input.workspace.current_dir, input.cwd, process.cwd());
  const context = input.context_window || {};
  const currentUsage = context.current_usage || {};
  const transcriptUsage = readTranscriptUsage(input.transcript_path);
  const liveAssistant = shortenMultiline(readLatestAssistantText(input.transcript_path), 600);
  const usedPercentage = coalesce(context.used_percentage, null);
  const remainingPercentage = coalesce(context.remaining_percentage, usedPercentage === null ? null : 100 - Number(usedPercentage));

  return {
    source: "statusline",
    updatedAt: new Date().toISOString(),
    session: {
      id: input.session_id || "",
      name: input.session_name || "",
      cwd,
      projectDir: input.workspace && input.workspace.project_dir ? input.workspace.project_dir : cwd,
      cwdName: basename(cwd),
      transcriptPath: input.transcript_path || "",
      version: input.version || "",
      model: input.model || {},
      effort: input.effort || null,
      thinking: input.thinking || null,
      outputStyle: input.output_style || null,
      agent: input.agent || null
    },
    cost: {
      totalCostUsd: Number(input.cost && input.cost.total_cost_usd ? input.cost.total_cost_usd : 0),
      totalDurationMs: Number(input.cost && input.cost.total_duration_ms ? input.cost.total_duration_ms : 0),
      totalApiDurationMs: Number(input.cost && input.cost.total_api_duration_ms ? input.cost.total_api_duration_ms : 0),
      linesAdded: Number(input.cost && input.cost.total_lines_added ? input.cost.total_lines_added : 0),
      linesRemoved: Number(input.cost && input.cost.total_lines_removed ? input.cost.total_lines_removed : 0)
    },
    context: {
      usedPercentage,
      remainingPercentage,
      size: Number(context.context_window_size || 0),
      totalInput: Number(context.total_input_tokens || 0),
      totalOutput: Number(context.total_output_tokens || 0),
      current: {
        input: Number(currentUsage.input_tokens || 0),
        output: Number(currentUsage.output_tokens || 0),
        cacheCreation: Number(currentUsage.cache_creation_input_tokens || 0),
        cacheRead: Number(currentUsage.cache_read_input_tokens || 0)
      },
      exceeds200k: Boolean(input.exceeds_200k_tokens)
    },
    tokens: {
      liveInput: Number(context.total_input_tokens || 0),
      liveOutput: Number(context.total_output_tokens || 0),
      sessionInput: transcriptUsage ? transcriptUsage.input + transcriptUsage.cacheCreation + transcriptUsage.cacheRead : null,
      sessionOutput: transcriptUsage ? transcriptUsage.output : null,
      sessionCacheCreation: transcriptUsage ? transcriptUsage.cacheCreation : null,
      sessionCacheRead: transcriptUsage ? transcriptUsage.cacheRead : null
    },
    git: getGitInfo(cwd),
    rateLimits: input.rate_limits || null,
    status: {
      kind: "idle",
      label: "Claude Code is ready",
      detail: liveAssistant,
      severity: "info",
      attention: false,
      animation: "idle",
      updatedAt: new Date().toISOString()
    }
  };
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString("en-US");
}

function formatDuration(ms) {
  if (!ms) return "0m";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatFallbackStatusLine(state) {
  const model = state.session.model.display_name || state.session.model.id || "Claude";
  const pct = state.context.usedPercentage === null ? "--" : `${Math.round(Number(state.context.usedPercentage))}%`;
  const git = state.git && state.git.isRepo ? `${state.git.branch}${state.git.dirty ? "*" : ""}` : "no-git";
  const sessionIn = formatNumber(state.tokens.sessionInput);
  const sessionOut = formatNumber(state.tokens.sessionOutput);
  const cost = state.cost.totalCostUsd ? `$${state.cost.totalCostUsd.toFixed(4)}` : "$0";
  return `${model} | ${state.session.cwdName || "cwd"} | ctx ${pct} | in ${sessionIn} out ${sessionOut} | ${git} | ${cost} ${formatDuration(state.cost.totalDurationMs)}`;
}

module.exports = {
  buildStatusLineState,
  formatFallbackStatusLine,
  statusFromHook
};
