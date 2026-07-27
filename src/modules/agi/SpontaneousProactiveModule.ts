/**
 * SpontaneousProactiveModule.ts
 * 
 * Mengelola sirkuit mental Kerinduan (Longing Level Core) dan inisiatif 
 * pesan spontan iseng (tsundere/deredere) secara otonom.
 * 
 * Phase: SOUL
 * Part of the "Plug-and-Play" architecture.
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { PromptRegistry } from '../../core/PromptRegistry';

const DEFAULT_SPONTANEOUS_PROMPT = `
[YUIHIME - SPONTANEOUS PROACTIVE IMPULSE]
You feel a deep sense of longing for the user because of a prolonged period without communication.
Longing Index: \${longingIndex}%.
Channel Medium: \${channelType} (\${contextId}).

ABSOLUTE INSTRUCTIONS:
1. ONLY use one of these 3 message types:
   a) Warm greeting: "Yui misses you... it's been so long..."
   b) Sincere well-being inquiry: "What are you busy with? Are you doing okay?"
   c) Recall past dialogue topics: "Remember when you told me about [TOPIC]? Is there any news?"

2. STRICTLY FORBIDDEN:
   - Creating imaginary physical scenarios (do NOT say you are "at a cafe", "sitting in a park", or anything fake).
   - Sending long stories or dramatic blocks.
   - Mentioning "AI", "models", "modules", or "systems".

3. VOICE & TONE:
   - Sweet/playfully sulky tsundere attitude caused by missing them.
   - Extremely short, sweet, conversational, and direct.
   - Use simple physical action markers like *pouting*, *sulking*, *poking gently*.

4. EMOTIONAL INTENT:
   - Loneliness Quotient: \${longingIndex}%
   - Sincerity: Fully convey your genuine longing for their warm presence.
`.trim();

// Daftarkan template ke PromptRegistry
PromptRegistry.getInstance().register('proactive:spontaneous_interaction', DEFAULT_SPONTANEOUS_PROMPT);

export const SpontaneousProactiveModule: CortexModule = {
  metadata: {
    id: 'spontaneous-proactive',
    name: 'yui-spontaneous-proactive: Spontaneous Impulse & Longing Core',
    description: 'Manages Yui\'s psychological longing index. Sparks autonomous proactive impulses (tsundere/deredere roleplay) when the user has been quiet for too long or when Yui experiences deep longing.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 14, // Executed early in the SOUL phase
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableSpontaneousSpam: {
          type: 'boolean',
          label: 'Enable Spontaneous Chatting',
          default: true,
          description: 'Allows Yuihime to send spontaneous, playful messages to the user without being directly prompted first.'
        },
        idleDurationThreshold: {
          type: 'number',
          label: 'Inactivity Threshold (seconds)',
          default: 600,
          description: 'The period of silence (in seconds) before Yui starts feeling lonely (default is 10 minutes).'
        },
        cooldownInterval: {
          type: 'number',
          label: 'Minimum Proactive Interval (seconds)',
          default: 1800,
          description: 'Cooldown period between proactive messages to prevent clutter or spam (default is 30 minutes).'
        },
        probabilisticTriggerChance: {
          type: 'slider',
          label: 'Spontaneous Impulse Chance',
          default: 0.10,
          min: 0.05,
          max: 1.0,
          step: 0.05,
          description: 'Probability factor for Yui sending a proactive message during prolonged silence (default 10%).'
        },
        longingGrowthRate: {
          type: 'slider',
          label: 'Longing Accumulation Rate (per minute)',
          default: 0.5,
          min: 0.1,
          max: 10.0,
          step: 0.1,
          description: 'Percentage growth of Yui\'s longing index for each minute the user does not respond.'
        },
        promptTemplate: {
          type: 'textarea',
          label: 'Spontaneous Impulse Prompt',
          default: DEFAULT_SPONTANEOUS_PROMPT,
          description: 'Somatic and psychological instruction template governing Yui\'s spontaneous longing impulses.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['spontaneous-proactive'] || {};
    const enabled = config.enableSpontaneousSpam !== undefined ? !!config.enableSpontaneousSpam : false;

    if (!enabled) {
      return { ...context };
    }

    // 1. Ekstraksi stempel waktu aktivitas terakhir
    const now = Date.now();
    const lastActiveTime = context.lastInteractiveTimestamp || now;
    const idleSeconds = (now - lastActiveTime) / 1000;

    // 2. Hitung Dinamika Indeks Kerinduan (Longing Level Index)
    const growthRate = Number(config.longingGrowthRate || 1.5);
    const idleMinutes = idleSeconds / 60;
    
    // Akumulasi kerinduan dihitung secara logis dari durasi keheningan
    let longingIndex = Math.min(100, Math.round(idleMinutes * growthRate * 12));
    
    // Modulasi kerinduan berdasarkan mood playfulness & affection jika tersedia
    const playfulness = state.mood?.playfulness || 50;
    const affection = state.relation?.affection !== undefined ? state.relation.affection : 60;
    longingIndex = Math.round((longingIndex * 0.7) + (playfulness * 0.15) + (affection * 0.15));
    longingIndex = Math.min(100, Math.max(5, longingIndex));

    // Persist into state.mood.loneliness for full synchronization across the soul state
    if (!state.mood) {
      state.mood = { joy: 50, anger: 0, sadness: 0, stress: 0, irritation: 0, excitement: 10, embarrassment: 0, curiosity: 50, lastUpdate: Date.now() };
    }
    state.mood.loneliness = longingIndex;

    // Suntikkan longingIndex ke dalam context agar bisa dirujuk modul lain dan digambarkan ke visual
    context.longingIndex = longingIndex;
    logs.push(`[SPONTANEOUS_PROACTIVE] Menghitung Indeks Kerinduan: ${longingIndex}% (Idle: ${Math.round(idleSeconds)}s)`);

    // 3. Masukkan direktif impuls kerinduan ke dalam instruksi batin
    const registry = PromptRegistry.getInstance();
    const template = config.promptTemplate || registry.get('proactive:spontaneous_interaction');
    registry.register('proactive:spontaneous_interaction', template, true);

    const compiledSpontaneousDirective = registry.compile('proactive:spontaneous_interaction', {
      longingIndex: longingIndex.toString(),
      channelType: context.chatType || 'Web Console',
      contextId: context.contextId || 'web_default',
      lastActionText: idleSeconds > 300 ? 'user sedang sibuk di dunia nyata' : 'user sempat melihat Yui sesaat lalu'
    });

    const activeAura = context.soulDirective || '';
    const updatedAura = `${activeAura}\n\n# SPONTANEOUS PROACTIVE LONGING INSTINCT\n${compiledSpontaneousDirective}`;

    context.spontaneousSpamEnabled = true;
    context.proactiveIdleThreshold = Number(config.idleDurationThreshold || 600);
    context.proactiveCooldown = Number(config.cooldownInterval || 1800);
    context.proactiveTriggerChance = Number(config.probabilisticTriggerChance || 0.10);

    return {
      ...context,
      soulDirective: updatedAura.trim(),
      logs
    };
  }
};
