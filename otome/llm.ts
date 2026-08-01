import { SystemRegistry } from '../shared/core/registry.js';
import { ProviderGatewayModule } from '../src/modules/ProviderGatewayModule.js';
import { SettingsManager } from '../src/core/kernel/settings.js';
import { GeminiProvider } from '../src/drivers/ai-providers/GeminiProvider.js';
import { OpenRouter } from '../src/drivers/ai-providers/OpenRouter.js';
import { AnthropicProvider } from '../src/drivers/ai-providers/AnthropicProvider.js';
import { OpenAIProvider } from '../src/drivers/ai-providers/OpenAIProvider.js';
import { YUI_PROFILE } from './character.js';
import type { AffectionLevel } from './engine.js';

export interface LLMContext {
  sceneText: string;
  choiceLabel: string;
  affection: number;
  affectionLevel: AffectionLevel;
  petName: string;
  flags: string[];
}

const TIMEOUT_MS = 20000;
let poolReady = false;

function ensurePool(): boolean {
  if (poolReady) return true;
  try {
    if (SystemRegistry.getProviders().length === 0) {
      SystemRegistry.register(GeminiProvider);
      SystemRegistry.register(OpenRouter);
      SystemRegistry.register(AnthropicProvider);
      SystemRegistry.register(OpenAIProvider);
    }
    poolReady = true;
    return true;
  } catch (e) {
    console.warn('[OTOME-POOL] System provider pool tidak bisa di-bootstrap.', e);
    poolReady = false;
    return false;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(v => { clearTimeout(t); resolve(v); })
      .catch(() => { clearTimeout(t); resolve(null); });
  });
}

function buildSystemPrompt(ctx: LLMContext): string {
  return [
    `You are roleplaying as ${YUI_PROFILE.name}, ${YUI_PROFILE.title}.`,
    `Personality: ${YUI_PROFILE.personality}`,
    `Speech: ${YUI_PROFILE.speechStyle}`,
    `Likes: ${YUI_PROFILE.likes.join('; ')}. Dislikes: ${YUI_PROFILE.dislikes.join('; ')}.`,
    `Current relationship: ${ctx.affectionLevel} (affection ${ctx.affection}/100). Address the player as "${ctx.petName}".`,
    ctx.flags.length ? `Relationship flags: ${ctx.flags.join(', ')}.` : '',
    '',
    'Scene:',
    ctx.sceneText,
    '',
    'TASK: Write YUI\'s reaction to the player\'s choice. 1-2 sentences, Bahasa Indonesia, fully in character, matching the relationship level (tsundere-cute, warmer as affection rises). Never break character, never use markdown or asterisks. Do NOT repeat the scene text.'
  ].filter(Boolean).join('\n');
}

function buildCombinedPrompt(ctx: LLMContext): string {
  return [
    buildSystemPrompt(ctx),
    '',
    `Player just chose: "${ctx.choiceLabel}".`,
    '',
    'React in character now.'
  ].join('\n');
}

async function viaSystemPool(prompt: string, systemPrompt: string): Promise<string | null> {
  if (!ensurePool()) return null;
  let settings: any;
  try {
    settings = await SettingsManager.getInstance().load();
  } catch (e) {
    console.warn('[OTOME-POOL] Gagal baca settings sistem, pakai env fallback.', e);
    settings = {};
  }
  const providerId = process.env.YUIHIME_OTOME_PROVIDER || 'gemini';
  const modelOverride = process.env.YUIHIME_OTOME_MODEL;
  const providerConf = settings.providers?.[providerId] || settings[providerId] || {};
  const config = {
    ...settings,
    provider: providerId,
    [providerId]: modelOverride ? { ...providerConf, model: modelOverride } : providerConf
  };
  try {
    const result = await withTimeout(
      ProviderGatewayModule.run(prompt, {} as any, {
        config,
        systemPrompt,
        bypassGateway: false
      } as any),
      TIMEOUT_MS
    );
    if (!result || result.activeProvider === 'offline_nano_nlp') return null;
    const raw = result.rawResult;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  } catch (e) {
    console.warn('[OTOME-POOL] Provider pool gagal, lanjut fallback env.', e);
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function viaOpenRouter(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model = process.env.YUIHIME_OTOME_MODEL || 'openai/gpt-4o-mini';
  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: 'React in character.' }
      ],
      max_tokens: 160,
      temperature: 0.9
    })
  });
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const content = data?.choices?.[0]?.message?.content;
  return typeof content === 'string' && content.trim() ? content.trim() : null;
}

async function viaGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.YUIHIME_OTOME_GEMINI_MODEL || 'gemini-2.0-flash';
  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 160, temperature: 0.9 }
      })
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as any;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

export async function yuiReaction(ctx: LLMContext): Promise<string | null> {
  const system = buildSystemPrompt(ctx);
  const combined = buildCombinedPrompt(ctx);
  try {
    const pool = await viaSystemPool(ctx.choiceLabel, system);
    if (pool) return pool;
    if (process.env.OPENROUTER_API_KEY) {
      const r = await viaOpenRouter(combined);
      if (r) return r;
    }
    if (process.env.GEMINI_API_KEY) {
      const r = await viaGemini(combined);
      if (r) return r;
    }
  } catch (e) {
    console.warn('[OTOME-LLM] LLM unavailable, using scripted fallback.', e);
  }
  return null;
}

export function llmAvailable(): boolean {
  if (ensurePool()) return true;
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY);
}
