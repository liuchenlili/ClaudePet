const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildStatusLineState, formatFallbackStatusLine, statusFromHook } = require("../src/shared/state");
const { buildPendingPermission, buildPermissionHookOutput } = require("../src/shared/permission-response");

test("buildStatusLineState extracts context, git fallback, and transcript usage", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claudepet-state-"));
  const transcript = path.join(dir, "session.jsonl");
  fs.writeFileSync(
    transcript,
    [
      JSON.stringify({ message: { usage: { input_tokens: 10, output_tokens: 3, cache_creation_input_tokens: 2 } } }),
      JSON.stringify({ usage: { input_tokens: 7, output_tokens: 5, cache_read_input_tokens: 11 } })
    ].join("\n"),
    "utf8"
  );
  const state = buildStatusLineState({
    session_id: "abc123",
    cwd: dir,
    transcript_path: transcript,
    model: { display_name: "Claude Sonnet" },
    context_window: {
      used_percentage: 12.4,
      context_window_size: 200000,
      total_input_tokens: 300,
      total_output_tokens: 40,
      current_usage: { input_tokens: 12, output_tokens: 2 }
    },
    cost: { total_cost_usd: 0.02, total_duration_ms: 61000 }
  });

  assert.equal(state.session.id, "abc123");
  assert.equal(state.context.usedPercentage, 12.4);
  assert.equal(state.context.size, 200000);
  assert.equal(state.tokens.sessionInput, 30);
  assert.equal(state.tokens.sessionOutput, 8);
  assert.equal(state.git.isRepo, false);
  assert.match(formatFallbackStatusLine(state), /Claude Sonnet/);
});

test("statusFromHook highlights permission and completion events", () => {
  const permission = statusFromHook({
    hook_event_name: "PermissionRequest",
    tool_name: "Bash",
    tool_input: { command: "npm test" }
  });
  assert.equal(permission.kind, "waiting-permission");
  assert.equal(permission.attention, true);
  assert.equal(permission.animation, "waiting");
  assert.equal(permission.tool, "Bash");
  assert.equal(permission.target, "npm test");

  const done = statusFromHook({
    hook_event_name: "Stop",
    last_assistant_message: "All done"
  });
  assert.equal(done.kind, "completed");
  assert.equal(done.animation, "success");
  assert.equal(done.attention, true);
});

test("permission response helpers build safe pending state and hook output", () => {
  const input = {
    hook_event_name: "PermissionRequest",
    tool_name: "Bash",
    tool_input: { command: "npm test", description: "Run tests" },
    permission_suggestions: [
      {
        type: "addRules",
        behavior: "allow",
        destination: "localSettings",
        rules: [{ toolName: "Bash", ruleContent: "npm test" }]
      }
    ]
  };

  const pending = buildPendingPermission(input, "req-1");
  assert.equal(pending.id, "req-1");
  assert.equal(pending.toolName, "Bash");
  assert.equal(pending.canAutoApprove, true);
  assert.equal(pending.tool_input, undefined);

  assert.deepEqual(buildPermissionHookOutput(input, "allow"), {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "allow" }
    }
  });
  assert.deepEqual(buildPermissionHookOutput(input, "deny"), {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "deny", message: "Denied from ClaudePet." }
    }
  });
  assert.deepEqual(buildPermissionHookOutput(input, "auto_yes_session"), {
    hookSpecificOutput: {
      hookEventName: "PermissionRequest",
      decision: { behavior: "allow" }
    }
  });

  const session = buildPermissionHookOutput(input, "allow_session");
  assert.equal(session.hookSpecificOutput.decision.behavior, "allow");
  assert.equal(session.hookSpecificOutput.decision.updatedPermissions[0].destination, "session");
  assert.deepEqual(session.hookSpecificOutput.decision.updatedPermissions[0].rules, input.permission_suggestions[0].rules);
});
