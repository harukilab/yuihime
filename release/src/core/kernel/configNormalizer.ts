/**
 * Centralized normalizer for provider config values that may arrive as
 * either a single string or an array (TOML array / multi-key pool).
 *
 * Rules:
 *  - apiKey / apiKeys / api_token / token / accessKeyId:
 *      → always normalized to an array of clean strings
 *  - model / modelId / preferredModel:
 *      → normalized to a single string (first element if array)
 */

export type MaybeStringOrArray = string | string[] | undefined | null;

export function toKeyArray(raw: MaybeStringOrArray): string[] {
  if (!raw) return [];
  const src = Array.isArray(raw) ? raw.join('\n') : String(raw);
  return src
    .split(/[\n,;]+/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0 && !k.toLowerCase().includes('your_api_key'));
}

export function toSingleString(raw: MaybeStringOrArray, fallback = ''): string {
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw.find((k) => typeof k === 'string' && k.trim().length > 0) || fallback;
  return String(raw).trim() || fallback;
}

export function resolveModel(raw: MaybeStringOrArray, fallback = ''): string {
  if (!raw) return fallback;
  const single = toSingleString(raw);
  if (!single) return fallback;
  let clean = single.replace(/^models\//, '');
  if (clean.includes(':')) {
    const parts = clean.split(':');
    if (parts[0] === 'gemini' || parts[0] === 'google') {
      clean = parts[parts.length - 1];
    }
  }
  if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts[0] === 'google') {
      clean = parts[parts.length - 1];
    }
  }
  return clean || fallback;
}
