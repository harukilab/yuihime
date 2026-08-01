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

const TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function buildPrompt(ctx: LLMContext): string {
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
    `Player just chose: "${ctx.choiceLabel}".`,
    '',
    'TASK: Write YUI\'s reaction to that choice. 1-2 sentences, Bahasa Indonesia, fully in character, matching the relationship level (tsundere-cute, warmer as affection rises). Never break character, never use markdown or asterisks. Do NOT repeat the scene text.'
  ].filter(Boolean).join('\n');
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
  const prompt = buildPrompt(ctx);
  try {
    if (process.env.OPENROUTER_API_KEY) {
      const r = await viaOpenRouter(prompt);
      if (r) return r;
    }
    if (process.env.GEMINI_API_KEY) {
      const r = await viaGemini(prompt);
      if (r) return r;
    }
  } catch (e) {
    console.warn('[OTOME-LLM] LLM unavailable, using scripted fallback.', e);
  }
  return null;
}

export function llmAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY);
}
