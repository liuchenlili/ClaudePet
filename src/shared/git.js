const { spawnSync } = require("node:child_process");

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    timeout: 1200
  });
  if (result.status !== 0) return null;
  return (result.stdout || "").trim();
}

function parseStatus(statusText) {
  const lines = statusText.split(/\r?\n/).filter(Boolean);
  const header = lines[0] && lines[0].startsWith("## ") ? lines.shift().slice(3) : "";
  let branch = header || "";
  let ahead = 0;
  let behind = 0;
  const upstreamIndex = branch.indexOf("...");
  if (upstreamIndex >= 0) branch = branch.slice(0, upstreamIndex);
  const tracking = header.match(/\[(.*?)\]/);
  if (tracking) {
    const aheadMatch = tracking[1].match(/ahead\s+(\d+)/);
    const behindMatch = tracking[1].match(/behind\s+(\d+)/);
    ahead = aheadMatch ? Number(aheadMatch[1]) : 0;
    behind = behindMatch ? Number(behindMatch[1]) : 0;
  }

  const counts = { staged: 0, modified: 0, untracked: 0, conflicts: 0 };
  for (const line of lines) {
    const x = line[0];
    const y = line[1];
    if (line.startsWith("??")) counts.untracked += 1;
    else {
      if (x && x !== " ") counts.staged += 1;
      if (y && y !== " ") counts.modified += 1;
      if (x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D")) {
        counts.conflicts += 1;
      }
    }
  }

  return {
    branch: branch || "HEAD",
    ahead,
    behind,
    staged: counts.staged,
    modified: counts.modified,
    untracked: counts.untracked,
    conflicts: counts.conflicts,
    dirty: counts.staged + counts.modified + counts.untracked + counts.conflicts > 0
  };
}

function getGitInfo(cwd) {
  if (!cwd) return { isRepo: false };
  const inside = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true") return { isRepo: false };
  const status = runGit(cwd, ["status", "--porcelain=v1", "--branch"]) || "";
  return {
    isRepo: true,
    ...parseStatus(status)
  };
}

module.exports = {
  getGitInfo,
  parseStatus
};
