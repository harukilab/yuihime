import fs from 'fs';
import path from 'path';
import { resolveAddonsDir, resolveCortexLoaderDir, resolveSystemRoot } from '../systemPaths.js';
import { buildSpatialAwarenessBlock, buildRecentDialogueTranscript } from './situationalContext.js';

// ExternalInjectionBus — universal hub for data injected by EXTERNAL features.
//
// External features live OUTSIDE the codebase and must not require code changes to
// participate:
//   - addons        (~/.yuihime/addons/<id>/) — on-demand tools. Any addon may drop an
//                   inject.json manifest listing state files it wants exposed.
//   - external cortex modules (~/.yuihime/cortexloader/<id>.json) — per-turn modules.
//
// The bus collects those sources + already-existing context fields (externalInjection,
// groundedKnowledge) into one complete snapshot ("jala keluar masuk data lengkap") that
// any consumer can render: the main prompt and/or sub-agent delegation. Nothing here is
// feature-specific — every source is manifest-driven, so any addon can participate.

export interface ExternalInjectionSource {
  id: string;
  label: string;
  file: string;
  maxChar?: number;
}

export interface ExternalCortexModuleInfo {
  id: string;
  name: string;
  description: string;
  phase: string;
}

interface BusCache {
  sources: ExternalInjectionSource[];
  cortexModules: ExternalCortexModuleInfo[];
  refreshedAt: number;
}

const REFRESH_TTL_MS = 15000;

function buildSubAgentSituationalBlock(parentContext: any): string {
  const memories = parentContext?.memories;
  if (!Array.isArray(memories) || memories.length === 0) return '';
  const parts: string[] = [];
  const location = ExternalInjectionBus.getInstance().resolveCurrentLocation(parentContext);
  parts.push(buildSpatialAwarenessBlock(memories, parentContext, { location }));
  const transcript = buildRecentDialogueTranscript(memories, parentContext, { contextSize: 20 });
  if (transcript && transcript !== 'No previous conversation records yet.') {
    parts.push(`[RECENT ROOM DIALOGUE — each line prefixed with its absolute local wall-clock time]\n${transcript}`);
  }
  return parts.join('\n\n');
}

export class ExternalInjectionBus {
  private static instance: ExternalInjectionBus | null = null;
  private cache: BusCache = { sources: [], cortexModules: [], refreshedAt: 0 };

  public static getInstance(): ExternalInjectionBus {
    if (!ExternalInjectionBus.instance) {
      ExternalInjectionBus.instance = new ExternalInjectionBus();
    }
    return ExternalInjectionBus.instance;
  }

  private resolveUserDataDir(): string {
    return process.env.YUIHIME_USER_DATA_PATH || path.join(resolveSystemRoot(), 'user_data');
  }

  public refresh(force = false): void {
    if (!force && Date.now() - this.cache.refreshedAt < REFRESH_TTL_MS) return;

    const sources: ExternalInjectionSource[] = [];
    const cortexModules: ExternalCortexModuleInfo[] = [];

    try {
      const addonsDir = resolveAddonsDir();
      if (fs.existsSync(addonsDir)) {
        for (const entry of fs.readdirSync(addonsDir, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          const manifestFile = path.join(addonsDir, entry.name, 'inject.json');
          if (!fs.existsSync(manifestFile)) continue;
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
            const list = Array.isArray(manifest) ? manifest : manifest.sources;
            for (const s of (list || [])) {
              if (!s || typeof s.file !== 'string') continue;
              sources.push({
                id: String(s.id || `${entry.name}:${s.file}`),
                label: String(s.label || s.id || entry.name),
                file: path.isAbsolute(s.file) ? s.file : path.join(this.resolveUserDataDir(), s.file),
                maxChar: typeof s.maxChar === 'number' ? s.maxChar : undefined
              });
            }
          } catch (e) {
            console.warn(`[INJ_BUS] Failed to parse inject.json in addon '${entry.name}':`, (e as Error)?.message);
          }
        }
      }
    } catch (e) {
      // addons dir unavailable — bus still works with cortex inventory only
    }

    try {
      const loaderDir = resolveCortexLoaderDir();
      if (fs.existsSync(loaderDir)) {
        for (const file of fs.readdirSync(loaderDir).filter(f => f.endsWith('.json') && f !== 'registry.json')) {
          try {
            const def = JSON.parse(fs.readFileSync(path.join(loaderDir, file), 'utf8'));
            if (!def || !def.id) continue;
            cortexModules.push({
              id: String(def.id).replace(/[^a-zA-Z0-9_-]/g, '_'),
              name: String(def.name || def.id),
              description: String(def.description || ''),
              phase: String(def.phase || '')
            });
          } catch (e) {
            // skip malformed module definition
          }
        }
      }
    } catch (e) {
      // cortexloader dir unavailable
    }

    this.cache = { sources, cortexModules, refreshedAt: Date.now() };
  }

  public getSources(): ExternalInjectionSource[] {
    this.refresh();
    return this.cache.sources;
  }

  public getCortexModules(): ExternalCortexModuleInfo[] {
    this.refresh();
    return this.cache.cortexModules;
  }

  public readSource(source: ExternalInjectionSource): string {
    try {
      if (!fs.existsSync(source.file)) return '';
      let text = fs.readFileSync(source.file, 'utf8');
      if (source.maxChar && text.length > source.maxChar) text = text.slice(0, source.maxChar);
      return text;
    } catch (e) {
      return '';
    }
  }

  public renderFileBlocks(excludeIds: string[] = []): string {
    const blocks: string[] = [];
    for (const src of this.getSources()) {
      if (excludeIds.includes(src.id)) continue;
      const text = this.readSource(src);
      if (!text.trim()) continue;
      blocks.push(`[${src.label.toUpperCase()}]\n${text.trim()}`);
    }
    return blocks.join('\n\n');
  }

  public renderCortexModuleInventory(): string {
    const modules = this.getCortexModules();
    if (modules.length === 0) return '';
    const list = modules
      .map(m => `- ${m.id} (phase: ${m.phase}${m.description ? `; ${m.description}` : ''})`)
      .join('\n');
    return `[INSTALLED EXTERNAL CORTEX MODULES]\n${list}`;
  }

  /**
   * Resolve Yui's CURRENT location — the single spatial truth shared by the main
   * prompt and sub-agent delegation on any channel. Entirely manifest-driven: it
   * scans the state files exposed by addon inject.json manifests and reads the
   * first generic JSON `location` field found. No feature-specific marker or
   * tool name is assumed, so any addon that publishes a location can participate.
   * Returns null when no location source exists.
   */
  public resolveCurrentLocation(context?: any): string | null {
    for (const src of this.getSources()) {
      const text = this.readSource(src);
      if (!text) continue;
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed.location === 'string' && parsed.location.trim()) {
          return parsed.location.trim();
        }
      } catch {
        // not JSON — keep scanning other sources
      }
    }
    return null;
  }

  public renderMainPromptBlock(context: any): string {
    const parts: string[] = [];
    const fileBlocks = this.renderFileBlocks();
    if (fileBlocks) parts.push(fileBlocks);
    const inventory = this.renderCortexModuleInventory();
    if (inventory) parts.push(inventory);
    return parts.join('\n\n');
  }

  public renderSubAgentBlock(parentContext: any, excludeIds: string[] = []): string {
    const parts: string[] = [];

    const fileBlocks = this.renderFileBlocks(excludeIds);
    if (fileBlocks) parts.push(fileBlocks);

    const ext = typeof parentContext?.externalInjection === 'string' ? parentContext.externalInjection.trim() : '';
    if (ext) parts.push(`[EXTERNAL LIVE INJECTIONS]\n${ext}`);

    const knowledge = typeof parentContext?.groundedKnowledge === 'string' ? parentContext.groundedKnowledge.trim() : '';
    if (knowledge) parts.push(`[GROUNDED KNOWLEDGE]\n${knowledge}`);

    const situational = buildSubAgentSituationalBlock(parentContext);
    if (situational) parts.push(situational);

    const inventory = this.renderCortexModuleInventory();
    if (inventory) parts.push(inventory);

    return parts.join('\n\n');
  }
}
