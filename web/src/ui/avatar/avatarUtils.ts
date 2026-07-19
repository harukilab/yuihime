export const getBaseUrl = () => {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  return (origin === 'null' || !origin) ? '' : origin;
};

export const MODEL_MAP: Record<string, string> = {
  'hiyori': '/models/hiyori/hiyori_free_t08.model3.json',
  'hyori': '/models/hiyori/hiyori_free_t08.model3.json',
  'haru': '/models/hiyori/hiyori_free_t08.model3.json',
  'shizuku': '/models/hiyori/hiyori_free_t08.model3.json',
  'mark': '/models/hiyori/hiyori_free_t08.model3.json', // Fallback to local Hiyori
  'rice': '/models/hiyori/hiyori_free_t08.model3.json'
};

export const HIYORI_ALTERNATIVES = [
  '/models/hiyori/hiyori_free_t08.model3.json',
  'https://cdn.jsdelivr.net/npm/live2d-lib@1.0.9/resources/Hiyori/Hiyori.model3.json'
];

export const resolveModelUrl = (url: string | undefined | null) => {
  if (!url) return getBaseUrl() + '/models/hiyori/hiyori_free_t08.model3.json';
  const normalized = url.toLowerCase().trim();

  // Redirect depreciated/broken CubismWebSamples Hiyori URLs or CDN Hiyori directly to our offline local asset
  if (normalized.includes('hiyori')) {
    console.log('[AVATAR] Hiyori URL detected. Re-routing to offline local asset for ultra-fast loading.');
    return getBaseUrl() + '/models/hiyori/hiyori_free_t08.model3.json';
  }

  const mapped = MODEL_MAP[normalized] || url;
  if (mapped.startsWith('/')) {
     const base = getBaseUrl();
     if (!base) return mapped;
     return base + mapped;
  }
  return mapped;
};
