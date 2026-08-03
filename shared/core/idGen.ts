export function genId(len: number = 9): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '').substring(0, len);
    }
  } catch (_) {}
  return Math.random().toString(36).substr(2, len);
}
