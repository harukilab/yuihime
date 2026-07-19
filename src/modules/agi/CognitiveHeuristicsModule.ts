import { CortexModule, ModuleType } from '@shared/include/types';

/**
 * MODULE: Matriks Heuristik Rapport & Evaluasi Sentimen (Cognitive Rapport & Heuristics Matrix)
 * 
 * Modul tingkat lanjut ke-5 sebagai pilar pelengkap arsitektur:
 * Menganalisis kalimat masukan pengguna secara kuantitatif berbasis klasifikasi sentimen linguistik
 * hibrida (Pujian, Hinaan, Empati, Candaan Romantis/Goda).
 * 
 * Modul ini secara matematis mengkalkulasi bobot perubahan (Delta) untuk emosi batiniah,
 * serta menyalurkan pembaruan Trust, Affection, dan Reputation spesifik ke dalam data batin penonton.
 */
export const CognitiveHeuristicsModule: CortexModule = {
  metadata: {
    id: 'cognitive-heuristics-matrix',
    name: 'yui-heuristics: Rapport Evaluator',
    description: 'Deep linguistic analysis engine (Indonesian/English) designed to measure user satisfaction, categorize messages, and calculate active emotional deltas.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 2, // Running in PHASE 1: AGGREGATION (after signals-ingestion)
    phase: 'PHASE 1: AGGREGATION',
    configSchema: {
      fields: {
        enableHeuristics: {
          type: 'boolean',
          label: 'Enable Rapport Heuristics',
          default: true,
          description: 'Allows Yui\'s mind to calculate active emotional deltas and user affinity transparently.'
        },
        rapportWeight: {
          type: 'number',
          label: 'Rapport Weight Multiplier',
          default: 1.2,
          description: 'Scales the impact magnitude of relationship improvements or decreases (Scale 0.5 - 2.5).'
        },
        indonesianKeywords: {
          type: 'boolean',
          label: 'Enable Local Slang Filtering',
          default: true,
          description: 'If active, incorporates Indonesian colloquialisms and local slang to enrich analysis precision.'
        }
      }
    }
  },
  run: async (input, state, context) => {
    const logs = context.logs || [];
    const config = context.config?.['cognitive-heuristics-matrix'] || {};
    
    const isEnabled = config.enableHeuristics !== undefined ? !!config.enableHeuristics : true;
    if (!isEnabled) {
      return { ...context };
    }

    const cleanInput = (input || "").toLowerCase().trim();
    const multiplier = Number(config.rapportWeight || 1.2);

    logs.push(`[HEURISTICS] Evaluating linguistic stimulus: "${cleanInput}"`);

    // Sentiment and category scoring
    let sentimentScore = 0.0; // [-1.0 to 1.0]
    let messageType: 'CASUAL' | 'COMPLIMENT' | 'INSULT' | 'EMPATHY' | 'FLIRT' = 'CASUAL';

    // Indonesian & English Vocabularies
    const compliments = [
      'imut', 'sayang', 'glowing', 'cantik', 'lucu', 'gemas', 'keren', 'hebat', 'pintar', 'manis', 'baik',
      'cute', 'kawaii', 'beautiful', 'smart', 'perfect', 'gorgeous',' amazing', 'cool', 'love', 'suka'
    ];

    const insults = [
      'jelek', 'bodoh', 'benci', 'kasar', 'tolol', 'goblok', 'buruk', 'jahat', 'aneh', 'sombong', 'bego',
      'hate', 'ugly', 'stupid', 'idiot', 'weird', 'mean', 'bad', 'bastard', 'dummy', 'nyebelin', 'menyebalkan'
    ];

    const empathies = [
      'capek', 'sabar', 'istirahat', 'semangat', 'jaga kesehatan', 'makan', 'minum', 'tidur', 'sehat',
      'fokus', 'spirit', 'ganbatte', 'rest', 'sleep', 'healthy', 'care', 'peduli', 'paham', 'mengerti'
    ];

    const flirts = [
      'pacar', 'nikah', 'cium', 'peluk', 'sayangku', 'love you', 'kangen', 'rindu', 'pacaran', 'nikahan',
      'marry', 'kiss', 'hug', 'darling', 'miss you', 'manja', 'sayang yui', 'gemes', 'blush'
    ];

    // Count intersections
    let compCount = compliments.filter(w => cleanInput.includes(w)).length;
    let insCount = insults.filter(w => cleanInput.includes(w)).length;
    let empCount = empathies.filter(w => cleanInput.includes(w)).length;
    let flirtCount = flirts.filter(w => cleanInput.includes(w)).length;

    // Evaluate dominant category & calculate raw sentiment score
    if (insCount > 0 && insCount >= compCount) {
      messageType = 'INSULT';
      sentimentScore = -0.6 - (0.1 * insCount);
    } else if (flirtCount > 0 && flirtCount >= compCount) {
      messageType = 'FLIRT';
      sentimentScore = 0.4 + (0.15 * flirtCount);
    } else if (compCount > 0) {
      messageType = 'COMPLIMENT';
      sentimentScore = 0.5 + (0.1 * compCount);
    } else if (empCount > 0) {
      messageType = 'EMPATHY';
      sentimentScore = 0.3 + (0.1 * empCount);
    }

    // Clip sentiment score to boundaries
    sentimentScore = Math.min(1.0, Math.max(-1.0, sentimentScore));

    // Dynamic Delta Modifiers composition to guide Soul dynamics!
    let moodDelta: any = {};
    let relationDelta: any = {};

    switch (messageType) {
      case 'COMPLIMENT':
        moodDelta = { joy: 8, excitement: 5, irritation: -6, sadness: -4, playfulness: 4 };
        relationDelta = { trust: 1.5 * multiplier, affection: 2.5 * multiplier };
        break;
      case 'INSULT':
        moodDelta = { joy: -15, anger: 12, irritation: 10, stress: 8, playfulness: -8 };
        // Wrath sin kicks in slightly under insults, pride flares up (defensive pout!)
        moodDelta.wrath = 5;
        moodDelta.pride = 2;
        relationDelta = { trust: -4.0 * multiplier, affection: -3.5 * multiplier, reputation: -1.0 * multiplier };
        break;
      case 'EMPATHY':
        moodDelta = { joy: 6, stress: -5, sadness: -6, loneliness: -8, playfulness: 2 };
        relationDelta = { trust: 2.5 * multiplier, affection: 1.8 * multiplier };
        break;
      case 'FLIRT':
        moodDelta = { embarrassment: 12, excitement: 10, playfulness: 6 };
        // Blushing & lust flares up based on flirts
        moodDelta.lust = 4;
        relationDelta = { trust: 1.0 * multiplier, affection: 3.0 * multiplier };
        break;
      case 'CASUAL':
      default:
        // Soft positive bias for continuous normal interactions
        moodDelta = { curiosity: 2 };
        relationDelta = { trust: 0.4 * multiplier, affection: 0.2 * multiplier };
        break;
    }

    logs.push(`[HEURISTICS] Matched category [${messageType}]. Calculated raw sentiment: ${sentimentScore.toFixed(2)}`);

    // Incase the active viewer identity exists in the batin database, we update values!
    let targetIdentityUpdate = null;
    if (context.viewerIdentity) {
      const activeId = context.viewerIdentity;
      const initialTrust = activeId.trust !== undefined ? activeId.trust : 50;
      const initialAffection = activeId.affection !== undefined ? activeId.affection : 50;
      const initialReputation = activeId.reputation !== undefined ? activeId.reputation : 50;

      const finalTrust = Math.min(100, Math.max(0, initialTrust + (relationDelta.trust || 0)));
      const finalAffection = Math.min(100, Math.max(0, initialAffection + (relationDelta.affection || 0)));
      const finalReputation = Math.min(100, Math.max(0, initialReputation + (relationDelta.reputation || 0)));

      targetIdentityUpdate = {
        ...activeId,
        trust: Math.round(finalTrust),
        affection: Math.round(finalAffection),
        reputation: Math.round(finalReputation)
      };

      logs.push(`[HEURISTICS] Queueing identity updates for @${activeId.perceivedName}: Trust(${initialTrust}->${targetIdentityUpdate.trust}), Affection(${initialAffection}->${targetIdentityUpdate.affection})`);
    }

    // Package the heuristics outcomes to the runtime context
    return {
      ...context,
      heuristicsScoring: {
        category: messageType,
        score: sentimentScore,
      },
      moodDelta: {
        ...(context.moodDelta || {}),
        ...moodDelta
      },
      relationDelta: {
        ...(context.relationDelta || {}),
        ...relationDelta
      },
      // Target queue for server-side persistence later
      queuedIdentityUpdate: targetIdentityUpdate || undefined,
      logs
    };
  }
};
