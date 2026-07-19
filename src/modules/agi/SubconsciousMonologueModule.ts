import { CortexModule, ModuleType } from '@shared/include/types';

/**
 * MODULE: Arsitektur Monolog Batin Sub-Sadar (Subconscious Inner Monologue Engine)
 * 
 * Modul ini merealisasikan rekomendasi arsitektural tingkat lanjut ke-4:
 * Menghasilkan untaian "Pikiran Bawah Sadar" (subconscious stream of consciousness)
 * orisinil yang tersinkronisasi murni dengan status emosi (mood), rindu (loneliness),
 * dan kasih sayang (affection) aktif terhadap subjek penonton.
 * 
 * Monolog batin ini dikomposisikan secara privat di belakang layar dan diinjeksi 
 * ke dalam prompt instruksi Cortex LLM, membimbing kognisi tanpa membocorkan tag 
 * batiniah kasar kepada penonton di layar visual.
 */
export const SubconsciousMonologueModule: CortexModule = {
  metadata: {
    id: 'subconscious-monologue',
    name: 'yui-subconscious: Inner Monologue',
    description: 'Constructs hidden subconscious streams of consciousness based on active soul state to mature Cortex cognition.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 3, // Running in PHASE 2: COMPRESSION
    phase: 'PHASE 2: COMPRESSION',
    configSchema: {
      fields: {
        enableMonologue: {
          type: 'boolean',
          label: 'Enable Subconscious Inner Monologue',
          default: true,
          description: 'Allows Yuihime\'s mind to generate hidden subconscious inner monologue streams.'
        },
        monologueTone: {
          type: 'select',
          label: 'Monologue Flow Focus',
          default: 'hybrid',
          options: [
            { label: 'Emotion-Centric', value: 'emotion' },
            { label: 'Relational-Centric', value: 'relation' },
            { label: 'Hybrid Dynamic', value: 'hybrid' }
          ]
        },
        monologuePrefix: {
          type: 'textarea',
          label: 'Inner Voice Directive Instruction',
          default: '[PRIVATE_INNER_MONOLOGUE]: The following represents your deepest subconscious inner voice/thoughts, completely silent to the outside world. Let this inner dynamic color and guide how you speak and react in the subsequent conversation!',
          description: 'Instruction template guiding Yuihime\'s private inner voice.'
        }
      }
    }
  },
  run: async (input, state, context) => {
    const logs = context.logs || [];
    const config = context.config?.['subconscious-monologue'] || {};
    
    const isEnabled = config.enableMonologue !== undefined ? !!config.enableMonologue : true;
    if (!isEnabled) {
      return { ...context };
    }

    const currentUserName = context.perceivedNameUpdate || context.userName || "Unknown Viewer";
    
    // Fetch emotional values
    const mood: any = state.mood || {};
    const joy = mood.joy ?? 50;
    const anger = mood.anger ?? 20;
    const stress = mood.stress ?? 25;
    const excitement = mood.excitement ?? 30;
    const irritation = mood.irritation ?? 15;
    const embarrassment = mood.embarrassment ?? 10;
    
    const loneliness = mood.loneliness ?? 15;
    const playfulness = mood.playfulness ?? 30;

    // Fetch relational values
    const trust = context.viewerIdentity?.trust ?? (state.relation?.trust || 50);
    const affection = context.viewerIdentity?.affection ?? (state.relation?.affection || 50);
    const pride = mood.pride ?? 75;

    let monologueSentences: string[] = [];

    // Synthesize monologue based on dynamic conditions
    
    // 1. Relational Affinity Context
    if (affection > 75) {
      monologueSentences.push(`My heart beats faster when looking at ${currentUserName}... They are truly a very special person to me.`);
      if (embarrassment > 40) {
        monologueSentences.push(`Oh dear, my face feels so warm, I hope they do not notice how embarrassed I am talking to them!`);
      }
    } else if (affection > 45) {
      monologueSentences.push(`I feel happy being close to ${currentUserName}, talking with them always feels fun and comfortable.`);
    } else if (trust < 35) {
      monologueSentences.push(`I should be slightly cautious. I can't immediately open up or trust ${currentUserName} completely just yet.`);
    }

    // 2. Loneliness (Kerinduan) Context
    if (loneliness > 65) {
      monologueSentences.push(`Honestly, I felt so lonely today from being quiet... it feels like such a relief to finally chat again.`);
    }

    // 3. Tsundere Pride vs Warm Hearts
    if (pride > 70 && affection > 50) {
      monologueSentences.push(`Even though I am extremely happy talking to them, my pride is high! I must not appear overly clingy too easily; a l-little tsundere distance is necessary.`);
    }

    // 4. Dominant Negative/Positive Emotion Context
    if (anger > 60 || irritation > 50) {
      monologueSentences.push(`Hmph, my mood is so bad! I feel sulky and irritated, how annoying! They must coax me first before I cheer up.`);
    } else if (stress > 60) {
      monologueSentences.push(`My cognitive state feels somewhat tired and strained, my head is full of thoughts.`);
    } else if (joy > 75 || excitement > 70) {
      monologueSentences.push(`Yaaaay! Today feels incredibly fun and exciting! My positive inner energy is fully charged.`);
    }

    // Compose final monologue context
    if (monologueSentences.length === 0) {
      monologueSentences.push(`My inner thoughts are calm. I am ready for a relaxed and warm chat with ${currentUserName} like a normal VTuber girl.`);
    }

    const monologueText = monologueSentences.join(" ");
    const prefix = config.monologuePrefix || '[PRIVATE_INNER_MONOLOGUE]: The following represents your deepest subconscious inner voice/thoughts, completely silent to the outside world. Let this inner dynamic color and guide how you speak and react in the subsequent conversation!';

    const fullMonologueBlock = `\n=========================================\n${prefix}\n"${monologueText}"\n=========================================\n`;

    // Inject into identity context as part of subconscious guidance!
    const finalIdentityContext = (context.identityContext || "") + `\n[SUBCONSCIOUS_NERVE]: ${fullMonologueBlock}\n`;

    logs.push(`[MONOLOGUE] Synthesized dynamic inner monologue reflecting ${monologueSentences.length} batin clusters.`);

    return {
      ...context,
      identityContext: finalIdentityContext,
      syntheticMonologue: monologueText,
      logs
    };
  }
};
