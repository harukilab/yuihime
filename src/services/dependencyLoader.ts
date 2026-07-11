import { logger } from '../core/kernel/logger';

// Safe require resolver for ES modules
let nodeRequire: any = null;
async function resolveRequire(): Promise<any> {
  if (nodeRequire) return nodeRequire;
  if (typeof window !== 'undefined') return null;
  try {
    const { createRequire } = await import('module');
    nodeRequire = createRequire(import.meta.url);
  } catch (e) {
    // Fallback for browsers
  }
  return nodeRequire;
}

/**
 * Utility class to dynamically load external NPM packages/dependencies directly from CDNs
 * such as unpkg, jsdelivr, or official hosts, at runtime without local installation.
 */
export class DependencyLoader {
  private static async getPaths() {
    const req = await resolveRequire();
    if (typeof process !== 'undefined' && typeof process.cwd === 'function' && req) {
      try {
        const path = req('path');
        const cacheDir = path.join(process.cwd(), '.yuihime', 'cache');
        const sdkCache = path.join(cacheDir, 'puter_sdk.js');
        return { cacheDir, sdkCache, req };
      } catch (err) {
        // ignore
      }
    }
    return { cacheDir: '', sdkCache: '', req: null };
  }

  private static CDN_URLS = [
    'https://unpkg.com/@heyputer/puter.js',
    'https://cdn.jsdelivr.net/npm/@heyputer/puter.js',
    'https://js.puter.com/v2/'
  ];

  /**
   * Helper function to perform HTTPS GET with redirect support.
   */
  private static async fetchWithRedirects(url: string, maxRedirects: number = 5): Promise<string> {
    const req = await resolveRequire();
    if (!req) {
      throw new Error('Node.js environment is not available to fetch dependencies.');
    }
    const https = req('https');

    return new Promise((resolve, reject) => {
      const requestUrl = (targetUrl: string, depth: number) => {
        if (depth > maxRedirects) {
          return reject(new Error(`Too many redirects (max: ${maxRedirects}) while fetching ${url}`));
        }

        https.get(targetUrl, (res) => {
          const { statusCode } = res;
          
          if (statusCode && statusCode >= 300 && statusCode < 400 && res.headers.location) {
            // Unpkg and jsdelivr dynamically redirect to versioned paths
            const redirectUrl = res.headers.location.startsWith('http')
              ? res.headers.location
              : new URL(res.headers.location, targetUrl).toString();
            
            logger.info(`[DependencyLoader] Redirecting to: ${redirectUrl}`, 'system');
            return requestUrl(redirectUrl, depth + 1);
          }

          if (statusCode !== 200) {
            return reject(new Error(`Failed to load dependency from ${targetUrl}, status code: ${statusCode}`));
          }

          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve(data));
        }).on('error', (err) => {
          reject(err);
        });
      };

      requestUrl(url, 0);
    });
  }

  /**
   * Safe directory creator.
   */
  private static async ensureCacheDir(cacheDir: string) {
    const req = await resolveRequire();
    if (!req || !cacheDir) return;
    const fs = req('fs');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
  }

  /**
   * Downloads and caches the Puter.js SDK from CDN, or reads the existing cached copy.
   */
  public static async loadPuterSdk(): Promise<any> {
    if (typeof window !== 'undefined') {
      return null; // Safe guard for client
    }

    const { cacheDir, sdkCache, req } = await this.getPaths();
    if (!cacheDir || !sdkCache || !req) {
      throw new Error('[DependencyLoader] Cannot resolve paths or req in browser context');
    }

    // Try loading locally installed dependency folder first
    try {
      const localSdk = req('@heyputer/puter.js');
      if (localSdk) {
        logger.info('[DependencyLoader] Successfully loaded local @heyputer/puter.js package from node_modules', 'system');
        if ((globalThis as any).puter) {
          return (globalThis as any).puter;
        }
        return localSdk;
      }
    } catch (err: any) {
      // Proceed to cache/CDN loading
    }

    await this.ensureCacheDir(cacheDir);

    const fs = req('fs');

    // Check if we have a locally cached version
    if (fs.existsSync(sdkCache)) {
      try {
        logger.info(`[DependencyLoader] Loading Puter JS SDK from cache: ${sdkCache}`, 'system');
        // Require the locally cached JavaScript file
        const puterSdk = req(sdkCache);
        if ((globalThis as any).puter) {
          return (globalThis as any).puter;
        }
        if (puterSdk) {
          return puterSdk;
        }
      } catch (err: any) {
        logger.error(`[DependencyLoader] Failed loading cached Puter JS SDK: ${err.message}. Re-downloading...`, 'system');
      }
    }

    // Try downloading from CDN list sequentially
    let lastError: Error | null = null;
    for (const cdnUrl of this.CDN_URLS) {
      try {
        logger.info(`[DependencyLoader] Downloading Puter JS SDK from CDN: ${cdnUrl}`, 'system');
        const scriptCode = await this.fetchWithRedirects(cdnUrl);
        
        // Write file safely
        fs.writeFileSync(sdkCache, scriptCode, 'utf8');
        logger.info(`[DependencyLoader] Puter JS SDK successfully cached at ${sdkCache}`, 'system');

        // Dynamically load the written module
        const puterSdk = req(sdkCache);
        if ((globalThis as any).puter) {
          return (globalThis as any).puter;
        }
        if (puterSdk) {
          return puterSdk;
        }
      } catch (err: any) {
        lastError = err;
        logger.warn(`[DependencyLoader] Failed to fetch/load from CDN ${cdnUrl}: ${err.message}`, 'system');
      }
    }

    throw new Error(`[DependencyLoader] Failed to retrieve @heyputer/puter.js SDK from all CDN sources. Last error: ${lastError?.message}`);
  }
}
