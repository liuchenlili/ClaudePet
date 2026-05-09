const fs = require("node:fs");

function addUsage(total, usage) {
  if (!usage || typeof usage !== "object") return;
  total.input += Number(usage.input_tokens || 0);
  total.output += Number(usage.output_tokens || 0);
  total.cacheCreation += Number(usage.cache_creation_input_tokens || 0);
  total.cacheRead += Number(usage.cache_read_input_tokens || 0);
}

function usageCandidates(record) {
  return [
    record && record.usage,
    record && record.message && record.message.usage,
    record && record.response && record.response.usage,
    record && record.assistant && record.assistant.usage
  ].filter(Boolean);
}

function readTranscriptUsage(file, maxBytes = 2 * 1024 * 1024) {
  if (!file || !fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  const start = Math.max(0, stat.size - maxBytes);
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);
    if (start > 0) lines.shift();
    const total = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        const seen = new Set();
        for (const usage of usageCandidates(record)) {
          if (seen.has(usage)) continue;
          seen.add(usage);
          addUsage(total, usage);
        }
      } catch {
        // Ignore partial or non-JSON transcript lines.
      }
    }
    return total.input || total.output || total.cacheCreation || total.cacheRead ? total : null;
  } finally {
    fs.closeSync(fd);
  }
}

function extractAssistantText(record) {
  const message = record && (record.message || record.assistant || record);
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") {
      const trimmed = block.text.trim();
      if (trimmed) parts.push(trimmed);
    }
  }
  return parts.join("\n").trim();
}

function isAssistantRecord(record) {
  if (!record || typeof record !== "object") return false;
  if (record.type === "assistant") return true;
  const message = record.message;
  if (message && message.role === "assistant") return true;
  return false;
}

function readLatestAssistantText(file, maxBytes = 1 * 1024 * 1024) {
  if (!file || !fs.existsSync(file)) return "";
  const stat = fs.statSync(file);
  const start = Math.max(0, stat.size - maxBytes);
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);
    if (start > 0) lines.shift();
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (!isAssistantRecord(record)) continue;
        const extracted = extractAssistantText(record);
        if (extracted) return extracted;
      } catch {
        // Skip partial or non-JSON lines.
      }
    }
    return "";
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = {
  readTranscriptUsage,
  readLatestAssistantText
};
