const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { appRoot } = require("./paths");
const { writeJson } = require("./json-file");

const DEFAULT_FRAME_WIDTH = 192;
const DEFAULT_FRAME_HEIGHT = 208;

function range(start, count) {
  return Array.from({ length: count }, (_, index) => start + index);
}

const DEFAULT_ANIMATIONS = {
  idle: { frames: range(0, 6), fps: 6, loop: true },
  thinking: { frames: range(8, 8), fps: 8, loop: true },
  tool: { frames: range(16, 8), fps: 10, loop: true },
  waiting: { frames: range(24, 4), fps: 5, loop: true },
  success: { frames: range(32, 5), fps: 10, loop: false },
  error: { frames: range(40, 8), fps: 6, loop: true },
  run: { frames: range(8, 8), fps: 12, loop: true }
};

function readWebpSize(file) {
  const bytes = fs.readFileSync(file);
  const type = bytes.toString("ascii", 12, 16);
  if (type === "VP8X") {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
    };
  }
  if (type === "VP8L") {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + (((b1 & 0x3f) << 8) | b0),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
    };
  }
  if (type === "VP8 ") {
    return {
      width: bytes[26] + ((bytes[27] & 0x3f) << 8),
      height: bytes[28] + ((bytes[29] & 0x3f) << 8)
    };
  }
  throw new Error(`Unsupported WebP chunk type ${type || "(unknown)"} in ${file}`);
}

function normalizeAnimation(animation, fallback) {
  const source = animation || fallback;
  return {
    frames: Array.isArray(source.frames) && source.frames.length ? source.frames.map(Number) : fallback.frames,
    fps: Number(source.fps || fallback.fps || 8),
    loop: source.loop !== false
  };
}

function normalizePetManifest(manifest, dir) {
  const spritesheetPath = manifest.spritesheetPath || "spritesheet.webp";
  const spritesheetFile = path.resolve(dir, spritesheetPath);
  const size = fs.existsSync(spritesheetFile) ? readWebpSize(spritesheetFile) : { width: 1536, height: 1104 };
  const frameWidth = Number(manifest.frameWidth || DEFAULT_FRAME_WIDTH);
  const frameHeight = Number(manifest.frameHeight || DEFAULT_FRAME_HEIGHT);
  const columns = Number(manifest.columns || Math.max(1, Math.floor(size.width / frameWidth)));
  const rows = Number(manifest.rows || Math.max(1, Math.floor(size.height / frameHeight)));
  const animations = {};
  for (const [name, fallback] of Object.entries(DEFAULT_ANIMATIONS)) {
    animations[name] = normalizeAnimation(manifest.animations && manifest.animations[name], fallback);
  }

  return {
    id: manifest.id || path.basename(dir),
    displayName: manifest.displayName || manifest.id || path.basename(dir),
    description: manifest.description || "",
    kind: manifest.kind || "character",
    spritesheetPath,
    spritesheetFile,
    spritesheetUrl: pathToFileURL(spritesheetFile).href,
    imageWidth: size.width,
    imageHeight: size.height,
    frameWidth,
    frameHeight,
    columns,
    rows,
    defaultScale: Number(manifest.defaultScale || 3),
    anchor: manifest.anchor || { x: 0.5, y: 1 },
    animations
  };
}

function listPets(root = appRoot()) {
  const petRoot = path.join(root, "pet");
  if (!fs.existsSync(petRoot)) return [];
  return fs
    .readdirSync(petRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(petRoot, entry.name);
      const manifestFile = path.join(dir, "pet.json");
      if (!fs.existsSync(manifestFile)) return null;
      const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      return normalizePetManifest(manifest, dir);
    })
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

function savePetManifest(petId, patch, root = appRoot()) {
  const dir = path.join(root, "pet", petId);
  const file = path.join(dir, "pet.json");
  const current = JSON.parse(fs.readFileSync(file, "utf8"));
  const next = {
    ...current,
    ...patch,
    id: current.id || petId,
    spritesheetPath: current.spritesheetPath || "spritesheet.webp"
  };
  writeJson(file, next);
  return normalizePetManifest(next, dir);
}

module.exports = {
  DEFAULT_ANIMATIONS,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_FRAME_HEIGHT,
  listPets,
  normalizePetManifest,
  readWebpSize,
  savePetManifest
};
