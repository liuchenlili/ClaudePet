const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback = null) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    if (process.env.CLAUDEPET_DEBUG) {
      console.error(`[claudepet] corrupt JSON at ${file}: ${error.message}`);
    }
    try {
      const quarantine = `${file}.corrupt-${Date.now()}`;
      fs.renameSync(file, quarantine);
    } catch {
      // Best-effort quarantine; ignore failures.
    }
    return fallback;
  }
}

function atomicReplace(tmp, file) {
  const transient = new Set(["EPERM", "EACCES", "EBUSY", "ENOTEMPTY"]);
  let attempt = 0;
  for (;;) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (error) {
      attempt += 1;
      if (attempt >= 5 || !transient.has(error && error.code)) throw error;
      const delay = 5 * attempt;
      const end = Date.now() + delay;
      while (Date.now() < end) {
        // Busy-wait briefly — rename retries on Windows when another
        // process is mid-replace on the same path.
      }
    }
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(tmp, payload, "utf8");
  try {
    atomicReplace(tmp, file);
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw error;
  }
}

function mergeDeep(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const output = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      output[key] = mergeDeep(output[key], value);
    } else {
      output[key] = value;
    }
  }
  return output;
}

module.exports = {
  ensureDir,
  readJson,
  writeJson,
  mergeDeep
};
