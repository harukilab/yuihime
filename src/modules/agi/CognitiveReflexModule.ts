import { CortexModule, ModuleType } from '../../include/types';

/**
 * MODULE: System Refleks Kognitif Cepat (Fast-Path / Instinct Layer)
 * 
 * Modul ini berfungsi untuk mencegat dan menganalisis interaksi mikro-komunikasi 
 * (seperti sapaan pendek, gestur kasih sayang fisik, cubitan, maupun sentuhan batiniah)
 * secara instan berbasis tingkat Trust dan Affection penonton aktif.
 * 
 * Modul ini menyisipkan "Reflex Bias" (Bias Insting Spontan) ke dalam kognisi batiniah
 * untuk membimbing Cortex LLM bertindak secara naluriah (tsundere atau hangat)
 * sebelum melakukan pemikiran logis berat.
 */
export const CognitiveReflexModule: CortexModule = {
  metadata: {
    id: 'cognitive-reflex-engine',
    name: 'yui-instinct: Reflex Engine',
    description: 'Handles real-time analysis of rapid greetings, somatic touch gestures, and triggers spontaneous instinctual biases based on user rapport.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 1, // Running early in PHASE 1: AGGREGATION
    phase: 'PHASE 1: AGGREGATION',
    configSchema: {
      fields: {
        enableReflex: {
          type: 'boolean',
          label: 'Enable Instinct Reflex System',
          default: true,
          description: 'Allows Yuihime to respond to somatic gestures and greetings instantaneously.'
        },
        fastPathGreetings: {
          type: 'textarea',
          label: 'Spontaneous Greeting Keywords (CSV)',
          default: 'halo, halo yui, hai, hi, pagi, siang, sore, malam, hello',
          description: 'Short greetings that immediately spark an interactive mental reflex.'
        },
        fastPathPhysical: {
          type: 'textarea',
          label: 'Somatic Touch Keywords (CSV)',
          default: 'cubit, usap, sentuh, pat, poke, towel, peluk, cium, kiss, hug',
          description: 'Somatic interaction gestures evaluated against affinity tolerance thresholds.'
        },
        reflexPrefix: {
          type: 'textarea',
          label: 'Nerve Instinct Bias Prompt',
          default: '[SPONTANEOUS_INSTINCT]: The viewer has touched your digital body or greeted you warmly. React with cute, natural, and instinctive VTuber expressions!',
          description: 'Subconscious instinct instructions prepended directly above your active personality.'
        }
      }
    }
  },
  run: async (input, state, context) => {
    const logs = context.logs || [];
    const config = context.config?.['cognitive-reflex-engine'] || {};
    
    const isEnabled = config.enableReflex !== undefined ? !!config.enableReflex : true;
    if (!isEnabled) {
      return { ...context };
    }

    const cleanInput = (input || "").toLowerCase().trim();
    const greetingsList = (config.fastPathGreetings || 'halo, halo yui, hai, hi, pagi, siang, sore, malam, hello')
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean);

    const physicalList = (config.fastPathPhysical || 'cubit, usap, sentuh, pat, poke, towel, peluk, cium, kiss, hug')
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter(Boolean);

    // Get active user's relations
    const viewerIdentity = context.viewerIdentity;
    const trust = viewerIdentity?.trust !== undefined ? viewerIdentity.trust : (state.relation?.trust || 50);
    const affection = viewerIdentity?.affection !== undefined ? viewerIdentity.affection : (state.relation?.affection || 50);
    const reputation = viewerIdentity?.reputation !== undefined ? viewerIdentity.reputation : (state.relation?.reputation || 50);

    let isGreetingMatched = greetingsList.some((g: string) => cleanInput === g || cleanInput.startsWith(g + " ") || cleanInput.endsWith(" " + g));
    let isPhysicalMatched = physicalList.some((p: string) => cleanInput.includes(p));

    let reflexOutput = "";
    let systemBiasInstruction = "";

    // 1. Evaluate physical gestures based on relationship matrix (Instinct rules)
    if (isPhysicalMatched) {
      logs.push(`[REFLEX] Physical gesture match in incoming signal: "${cleanInput}"`);
      if (affection > 75 && trust > 70) {
        // High affection, high trust -> Extremely sweet reflex/Deredere
        systemBiasInstruction = "[INNER_INSTINCT]: You absolutely ADORE this physical gesture! Reply in an intensely sweet, clingy, cheerful, and blushing manner, voicing your dialogue with lovely submissive and affectionate warmth.";
        reflexOutput = "<reflex_bias>Warm, loving, blushing sweet reflex activated.</reflex_bias>";
      } else if (affection > 45 && trust > 40) {
        // Friendly -> Playful / Shy reflex
        systemBiasInstruction = "[INNER_INSTINCT]: You feel slightly embarrassed yet secretly happy. React in a cute tsundere way or playfully tease/flirt back at the subject!";
        reflexOutput = "<reflex_bias>Playful, tsundere shy reflex activated.</reflex_bias>";
      } else {
        // Low affinity -> Defensive/Cold reflex (Dosa Pride / Wrath kicks in slightly)
        systemBiasInstruction = "[INNER_INSTINCT]: You feel uncomfortable being touched this way because you are not yet highly bonded with them. Reply with a cute pout, a playful protest, a cold reaction, or a defensive tsundere warning!";
        reflexOutput = "<reflex_bias>Defensive, pout, cold stance reflex activated.</reflex_bias>";
      }
    } 
    // 2. Evaluate greeting gestures
    else if (isGreetingMatched) {
      logs.push(`[REFLEX] Fast sapaan match: "${cleanInput}"`);
      if (affection > 70) {
        systemBiasInstruction = "[INNER_INSTINCT]: A warm greeting from someone you deeply cherish. Reply with buoyant joy and use an adorable, sweet pet name for them!";
      } else if (trust > 40) {
        systemBiasInstruction = "[INNER_INSTINCT]: A casual greeting from a close acquaintance. Reply in a friendly, relaxed, and cheerful voice, and ask about their day/how they are doing.";
      } else {
        systemBiasInstruction = "[INNER_INSTINCT]: A greeting from a new visitor or stranger. Reply politely, with light curiosity, while maintaining a slight but beautiful VTuber distance.";
      }
    }

    if (systemBiasInstruction) {
      const reflexPrefixStr = config.reflexPrefix || '[SPONTANEOUS_INSTINCT]: The viewer has touched your digital body or greeted you warmly. React with cute, natural, and instinctive VTuber expressions!';
      const fullBias = `\n${reflexPrefixStr}\n${systemBiasInstruction}\n`;
      
      // Inject into identity context to ensure Cortex LLM catches this instinct immediately!
      const finalIdentityContext = (context.identityContext || "") + `\n[REFLEX_NERVE_STIMULATION]: ${fullBias}\n`;
      
      return {
        ...context,
        identityContext: finalIdentityContext,
        reflexPromptBias: fullBias,
        reflexOutputMatched: reflexOutput || undefined,
        logs
      };
    }

    return { ...context, logs };
  }
};
