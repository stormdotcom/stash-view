// Formatting utilities shared across all tab modules.

/** Determine the type label for a storage value string */
export function detectType(value) {
  if (value === null || value === undefined) return 'null';
  if (value === 'null') return 'null';
  if (value === 'true' || value === 'false') return 'boolean';
  if (!isNaN(Number(value)) && value.trim() !== '') return 'number';
  try { const p = JSON.parse(value); return Array.isArray(p) ? 'array' : (typeof p === 'object' && p !== null ? 'object' : 'string'); } catch { return 'string'; }
}

/** Try to parse a value as JSON; returns { parsed, isJson } */
export function tryParseJSON(value) {
  try {
    const parsed = JSON.parse(value);
    return { parsed, isJson: true };
  } catch {
    return { parsed: value, isJson: false };
  }
}

/** Format byte size as human-readable */
export function formatBytes(str) {
  const bytes = new TextEncoder().encode(str).length;
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}kB`;
}

/** Escape HTML for safe insertion */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
