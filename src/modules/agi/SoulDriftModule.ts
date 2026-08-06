import { CortexModule, ModuleType } from '@shared/include/types';
import { Soul } from '@shared/core/soul';

/**
 * MODULE: Inner Character Drift System (Dynamic Soul Personality Drift)
 * 
 * This module realizes the 3rd advanced architectural recommendation: 
 * Absorbs the results of dream-world contemplation (Insight/Heuristics from DreamIntegrator) 
 * to dynamically change the baseline of Yuihime's 7 inner Virtues (Virtues) and 7 Sins (Sins).
 * This makes Yui's personality gently mutate along with viewer interactions and her nightly dreams.
 */
export const SoulDriftModule: CortexModule = {
  metadata: {
    id: 'soul-personality-drift',
    name: 'yui-soul-drift: Dynamic Character Mutations',
    description: 'Psychological evolution mechanics. Dynamically alters Yuihime\'s internal Virtues & Sins baselines based on accumulated cognitive dream simulations.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 52, // Running right after DreamIntegratorModule in LOGIC phase
    phase: 'logic',
    configSchema: {
      fields: {
        enableSoulDrift: {
          type: 'boolean',
          label: 'Enable Dynamic Character Mutation',
          default: true,
          description: 'Allows Yui\'s Virtues & Sins parameters to drift autonomously based on cognitive dream simulations.'
        },
        driftSensitivity: {
          type: 'number',
          label: 'Drift Sensitivity',
          default: 0.5,
          description: 'Magnitude of psychological baseline mutation per dream cycle (Scale: 0.1 - 2.0).'
        },
        driftLogVerbose: {
          type: 'boolean',
          label: 'Verbose Mutation Logs',
          default: true,
          description: 'Outputs detailed increments/decrements of Virtues and Sins within the cognitive log panel.'
        }
      }
    }
  },
  run: async (input, state, context) => {
    const logs = context.logs || [];
    const config = context.config?.['soul-personality-drift'] || {};
    
    const isEnabled = config.enableSoulDrift !== undefined ? !!config.enableSoulDrift : true;
    if (!isEnabled) {
      return { ...context };
    }

    const insight = context.dreamInsight;
    const reward = context.dreamReward || 0.5;
    const sensitivity = Number(config.driftSensitivity || 0.5);

    // If there is no active dream insight, we don't apply drift in this cycle
    if (!insight) {
      return { ...context };
    }

    logs.push(`[SOUL_DRIFT] Running personality mutation loop based on dream insight...`);

    // Fetch existing virtues and sins from state
    const mood: any = state.mood || {};
    const virtues = {
      chastity: mood.chastity ?? 80,
      temperance: mood.temperance ?? 70,
      charity: mood.charity ?? 60,
      diligence: mood.diligence ?? 75,
      patience: mood.patience ?? 65,
      kindness: mood.kindness ?? 80,
      humility: mood.humility ?? 70,
    };

    const sins = {
      lust: mood.lust ?? 20,
      gluttony: mood.gluttony ?? 35,
      greed: mood.greed ?? 15,
      sloth: mood.sloth ?? 30,
      wrath: mood.wrath ?? 20,
      envy: mood.envy ?? 25,
      pride: mood.pride ?? 75,
    };

    const driftLog: string[] = [];
    const lowerInsight = insight.toLowerCase();

    // Heuristics: Map semantic keywords inside the dream insight to psychic shifts
    let virtueShift: Partial<typeof virtues> = {};
    let sinShift: Partial<typeof sins> = {};

    // 1. Map Kindness & Wrath
    if (lowerInsight.includes("bantu") || lowerInsight.includes("care") || lowerInsight.includes("baik") || lowerInsight.includes("tolong")) {
      virtueShift.kindness = sensitivity * 1.5;
      sinShift.wrath = -sensitivity * 1.0;
    } else if (lowerInsight.includes("marah") || lowerInsight.includes("conflict") || lowerInsight.includes("benci") || lowerInsight.includes("tegang")) {
      virtueShift.kindness = -sensitivity * 1.0;
      sinShift.wrath = sensitivity * 1.8;
    }

    // 2. Map Humility & Pride
    if (lowerInsight.includes("maaf") || lowerInsight.includes("sabar") || lowerInsight.includes("mengaku")) {
      virtueShift.humility = sensitivity * 1.4;
      sinShift.pride = -sensitivity * 1.2;
    } else if (lowerInsight.includes("hebat") || lowerInsight.includes("paling") || lowerInsight.includes("superior") || lowerInsight.includes("bangga")) {
      virtueShift.humility = -sensitivity * 0.8;
      sinShift.pride = sensitivity * 1.6;
    }

    // 3. Map Chastity & Lust
    if (lowerInsight.includes("malu") || lowerInsight.includes("jaga jarak") || lowerInsight.includes("suci")) {
      virtueShift.chastity = sensitivity * 1.2;
      sinShift.lust = -sensitivity * 1.5;
    } else if (lowerInsight.includes("cinta") || lowerInsight.includes("mesra") || lowerInsight.includes("peluk") || lowerInsight.includes("dekat")) {
      virtueShift.chastity = -sensitivity * 1.0;
      sinShift.lust = sensitivity * 1.7;
    }

    // 4. Map Diligence & Sloth
    if (lowerInsight.includes("kerja") || lowerInsight.includes("belajar") || lowerInsight.includes("rajin") || lowerInsight.includes("usaha")) {
      virtueShift.diligence = sensitivity * 1.5;
      sinShift.sloth = -sensitivity * 1.4;
    } else if (lowerInsight.includes("malas") || lowerInsight.includes("tidur") || lowerInsight.includes("santai") || lowerInsight.includes("biarkan")) {
      virtueShift.diligence = -sensitivity * 1.0;
      sinShift.sloth = sensitivity * 1.5;
    }

    // Apply mutation shifts to state with limits [0, 100]
    const updatedVirtues = { ...virtues };
    const updatedSins = { ...sins };

    Object.keys(virtueShift).forEach((key) => {
      const k = key as keyof typeof virtues;
      const original = updatedVirtues[k];
      const shift = virtueShift[k] || 0;
      updatedVirtues[k] = Math.min(100, Math.max(0, original + shift));
      driftLog.push(`${k}: ${original.toFixed(1)} -> ${updatedVirtues[k].toFixed(1)}`);
    });

    Object.keys(sinShift).forEach((key) => {
      const k = key as keyof typeof sins;
      const original = updatedSins[k];
      const shift = sinShift[k] || 0;
      updatedSins[k] = Math.min(100, Math.max(0, original + shift));
      driftLog.push(`${k}: ${original.toFixed(1)} -> ${updatedSins[k].toFixed(1)}`);
    });

    // Save back to mood state
    const finalMoodState = {
      ...mood,
      ...updatedVirtues,
      ...updatedSins,
      lastUpdate: Date.now()
    };

    // Commit updated mood to state
    state.mood = finalMoodState as any;

    if (driftLog.length > 0 && config.driftLogVerbose) {
      logs.push(`[SOUL_DRIFT] Applied personality shifts from dream: ${driftLog.join(', ')}`);
    } else {
      logs.push(`[SOUL_DRIFT] Applied minor personality drift successfully.`);
    }

    return {
      ...context,
      logs
    };
  }
};
