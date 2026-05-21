const { describeTool } = require("./state");

const VALID_ACTIONS = new Set(["allow", "deny", "allow_session", "auto_yes_session"]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function permissionSuggestions(input) {
  return Array.isArray(input && input.permission_suggestions) ? input.permission_suggestions : [];
}

function sessionPermissionUpdates(input) {
  return permissionSuggestions(input)
    .filter((suggestion) => suggestion && typeof suggestion === "object")
    .map((suggestion) => ({ ...cloneJson(suggestion), destination: "session" }));
}

function buildPendingPermission(input = {}, requestId) {
  const info = describeTool(input);
  const toolName = info.tool || input.tool_name || "Tool";
  const detail = info.summary || input.message || "Claude Code needs permission.";
  return {
    id: requestId,
    toolName,
    title: `Allow ${toolName}?`,
    detail,
    requestedAt: new Date().toISOString(),
    canAutoApprove: sessionPermissionUpdates(input).length > 0
  };
}

function buildPermissionHookOutput(input = {}, action) {
  if (!VALID_ACTIONS.has(action)) return null;
  const decision = action === "deny"
    ? { behavior: "deny", message: "Denied from ClaudePet." }
    : { behavior: "allow" };

  if (action === "allow_session") {
    const updates = sessionPermissionUpdates(input);
    if (updates.length) decision.updatedPermissions = updates;
  }

  return {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision
    }
  };
}

module.exports = {
  buildPendingPermission,
  buildPermissionHookOutput,
  sessionPermissionUpdates
};
