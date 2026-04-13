export const EPSILON = 0.000001;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function round(value, decimals = 3) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function prettyName(path) {
  if (!path) return "";
  return path.split("/").pop();
}

export function sanitizeName(name, fallback = "Scene") {
  const trimmed = (name || "").trim();
  if (!trimmed) return fallback;
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

export function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}
