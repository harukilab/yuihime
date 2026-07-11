/**
 * Safe wrapper for localStorage access to prevent crashes in restricted iframe environments.
 */
export const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return typeof window !== 'undefined' && window.localStorage ? localStorage.getItem(key) : null;
    } catch (e) {
      console.warn(`[SAFE_STORAGE] Failed to access localStorage: ${e}`);
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn(`[SAFE_STORAGE] Failed to set localStorage: ${e}`);
    }
  },
  removeItem: (key: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(key)
      }
    } catch (e) {
      console.warn(`[SAFE_STORAGE] Failed to remove from localStorage: ${e}`);
    }
  },
  parseJSON: <T>(key: string, fallback: T): T => {
    const saved = safeLocalStorage.getItem(key);
    if (saved === null) return fallback;
    try {
      return JSON.parse(saved) as T;
    } catch (e) {
      console.warn(`[SAFE_STORAGE] JSON corruption for key "${key}":`, e);
      return fallback;
    }
  }
};
