import { CortexModule, ModuleType, AgentState } from '../include/types';
import { SettingsManager } from '../core/kernel/settings';

/**
 * Heuristic L2D Semantic-to-Expression / Posture Engine
 * Dynamically extract emotional cues, sways, and limb movements from synthesized text response.
 */
export class L2DExpressionTranslator {
  /**
   * Translates text dialogue into an array of system animations and mood impact deltas.
   * Leverages custom user-defined keywords from config.toml with high-fidelity fallbacks.
   */
  public static translate(text: string): { animations: string[]; moodImpact: Record<string, number> } {
    const rawText = (text || "").toLowerCase();
    const animations: string[] = [];
    const moodImpact: Record<string, number> = {};

    // Retrieve settings dynamically from the SettingsManager
    const settings = SettingsManager.getInstance().get('l2d-translator') || {};

    // Direct helper to clean up comma-separated strings inside Config schema
    const parseKeywords = (fieldValue: any, defaults: string): string[] => {
      const val = typeof fieldValue === 'string' ? fieldValue : defaults;
      return val.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
    };

    // Extract keyword arrays from Settings Tab
    const smileKeys = parseKeywords(settings.smileKeywords, 'hehe, senang, cantik, gembira, terima kasih, makasih, lucu, imut, suka, bahagia, halo, hai, yey, gemas, ceria, bagus, mantap, keren');
    const laughKeys = parseKeywords(settings.laughKeywords, 'wkwk, haha, hihi, hehehe, tawa, tertawa, lucu banget, kocak, gokil, kwkw');
    const nodKeys = parseKeywords(settings.nodKeywords, 'ya, iya, betul, benar, setuju, tentu saja, paham, mengerti, siap, baiklah, okey, oke, ok, pastinya, semangat');
    const shakeKeys = parseKeywords(settings.shakeKeywords, 'tidak, bukan, nggak, gajadi, jangan, salah, tidak tahu, belum, bingung, aneh, mustahil, enggan, tak tahu');
    const surpriseKeys = parseKeywords(settings.surpriseKeywords, 'hah, apa, eh, wah, kaget, terkejut, serius, wow, oh, astaga, waduh, lah');
    const thinkKeys = parseKeywords(settings.thinkKeywords, 'hm, hmm, em, emm, pikir, mikir, analisis, tunggu, sebentar, kurasa, mungkin, bagaimana, entahlah, sepertinya, mengapa, kenapa');
    const sadKeys = parseKeywords(settings.sadKeywords, 'sedih, nangis, hiks, kasihan, maaf, lemas, kecewa, sayang sekali, huft, sepi, kesepian, sunyi, sakit');
    const angryKeys = parseKeywords(settings.angryKeywords, 'marah, kesal, benci, menyebalkan, ih, huh, sebal, tidak suka, bodoh, berisik, bising, menyebalkan');
    const blushKeys = parseKeywords(settings.blushKeywords, 'malu, pipi merah, uwu, salting, salah tingkah, aduh, deg-deg, terharu, terpuji, sayang, cinta');
    const waveKeys = parseKeywords(settings.waveKeywords, 'halo, hai, welcome, selamat datang, dadah, sampai jumpa, bye, pagi, siang, sore, malam, assalamualaikum');

    const containsAny = (keys: string[]): boolean => {
      return keys.some(key => rawText.includes(key));
    };

    // 1. Natural Laugh Tracker
    if (containsAny(laughKeys)) {
      animations.push("Laugh");
      moodImpact.joy = 12;
      moodImpact.excitement = 8;
    }
    // 2. Smile & Affection Tracker
    else if (containsAny(smileKeys)) {
      animations.push("Smile");
      moodImpact.joy = 8;
    }

    // 3. Agreement / Confident Nod
    if (containsAny(nodKeys)) {
      animations.push("Nod");
    }

    // 4. Doubt / Disagreement Shake
    if (containsAny(shakeKeys)) {
      animations.push("Shake");
    }

    // 5. Instaneous Surprise
    if (containsAny(surpriseKeys)) {
      animations.push("Surprise");
      moodImpact.excitement = 14;
    }

    // 6. Thinking Pause
    if (containsAny(thinkKeys)) {
      animations.push("Think");
    }

    // 7. Sadness / Low Energy Melancholy
    if (containsAny(sadKeys)) {
      animations.push("Sad");
      moodImpact.sadness = 12;
    }

    // 8. Irritation / Aggressive Anger
    if (containsAny(angryKeys)) {
      animations.push("Angry");
      moodImpact.anger = 12;
      moodImpact.irritation = 10;
    }

    // 9. Shy blushing / UWU mode
    if (containsAny(blushKeys)) {
      animations.push("Blush");
      moodImpact.embarrassment = 10;
    }

    // 10. Greetings Wave
    if (containsAny(waveKeys)) {
      animations.push("Wave");
    }

    // Intelligent Fallback mapping based on ending punctuations if empty
    if (animations.length === 0) {
      if (rawText.endsWith('?')) {
        animations.push("Think");
      } else if (rawText.endsWith('!')) {
        animations.push("Nod");
      } else {
        // Subtle default smile to preserve charm
        animations.push("Smile");
      }
    }

    // Return deduplicated array
    return {
      animations: Array.from(new Set(animations)),
      moodImpact
    };
  }
}

/**
 * Pluggable Cortex Module Registration for UI and settings autodiscovery
 */
export const L2DExpressionTranslatorModule: CortexModule = {
  metadata: {
    id: 'l2d-translator',
    name: 'L2D Expression Translator',
    description: 'Secara otomatis menerjemahkan ucapan teks dari mini-LLM/local NLP menjadi gerakan & ekspresi Live2D ketika tag animasi kosong.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    phase: 'PHASE 4: EXPRESSION',
    order: 5,
    settingsTab: 'Neural',
    configSchema: {
      fields: {
        enableAutoTranslation: {
          type: 'boolean',
          label: 'Aktifkan Penerjemah Ekspresi Otomatis',
          default: true,
          description: 'Secara otomatis menerjemahkan ucapan teks dari mini-LLM/local NLP menjadi gerakan & ekspresi Live2D ketika tag animasi kosong.'
        },
        smileKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Senyum (Smile)',
          default: 'hehe, senang, cantik, gembira, terima kasih, makasih, lucu, imut, suka, bahagia, halo, hai, yey, gemas, ceria, bagus, mantap, keren',
          description: 'Kata kunci (dipisahkan koma) untuk memicu ekspresi Senyum (Smile).'
        },
        laughKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Tertawa (Laugh)',
          default: 'wkwk, haha, hihi, hehehe, tawa, tertawa, lucu banget, kocak, gokil, kwkw',
          description: 'Kata kunci (dipisahkan koma) untuk memicu gerakan Tertawa (Laugh).'
        },
        nodKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Angguk (Nod)',
          default: 'ya, iya, betul, benar, setuju, tentu saja, paham, mengerti, siap, baiklah, okey, oke, ok, pastinya, semangat',
          description: 'Kata kunci (dipisahkan koma) untuk memicu gerakan Mengangguk (Nod).'
        },
        shakeKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Geleng (Shake)',
          default: 'tidak, bukan, nggak, gajadi, jangan, salah, tidak tahu, belum, bingung, aneh, mustahil, enggan, tak tahu',
          description: 'Kata kunci (dipisahkan koma) untuk memicu gerakan Menggeleng (Shake).'
        },
        surpriseKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Kaget (Surprise)',
          default: 'hah, apa, eh, wah, kaget, terkejut, serius, wow, oh, astaga, waduh, lah',
          description: 'Kata kunci (dipisahkan koma) untuk memicu gerakan Terkejut (Surprise).'
        },
        thinkKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Berpikir (Think)',
          default: 'hm, hmm, em, emm, pikir, mikir, analisis, tunggu, sebentar, kurasa, mungkin, bagaimana, entahlah, sepertinya, mengapa, kenapa',
          description: 'Kata kunci (dipisahkan koma) untuk memicu gerakan Berpikir (Think).'
        },
        sadKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Sedih (Sad)',
          default: 'sedih, nangis, hiks, kasihan, maaf, lemas, kecewa, sayang sekali, huft, sepi, kesepian, sunyi, sakit',
          description: 'Kata kunci (dipisahkan koma) untuk memicu gerakan Sedih (Sad).'
        },
        angryKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Marah (Angry)',
          default: 'marah, kesal, benci, menyebalkan, ih, huh, sebal, tidak suka, bodoh, berisik, bising, menyebalkan',
          description: 'Kata kunci (dipisahkan koma) untuk memicu gerakan Marah (Angry).'
        },
        blushKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Malu (Blush)',
          default: 'malu, pipi merah, uwu, salting, salah tingkah, aduh, deg-deg, terharu, terpuji, sayang, cinta',
          description: 'Kata kunci (dipisahkan koma) untuk memicu gerakan Rona Merah (Blush).'
        },
        waveKeywords: {
          type: 'textarea',
          label: 'Kata Kunci Lambai (Wave)',
          default: 'halo, hai, welcome, selamat datang, dadah, sampai jumpa, bye, pagi, siang, sore, malam, assalamualaikum',
          description: 'Kata kunci (dipisahkan koma) untuk memicu gerakan Melambai (Wave).'
        }
      }
    }
  },
  run: async (input: string, _state: AgentState, context: any) => {
    // If running in pipeline context, we can enrich the context animations
    const targetText = context.processedResponse || input;
    const settings = SettingsManager.getInstance().get('l2d-translator') || {};
    const enabled = settings.enableAutoTranslation !== undefined ? settings.enableAutoTranslation : true;

    if (enabled && (!context.animations || context.animations.length === 0)) {
      const enrichment = L2DExpressionTranslator.translate(targetText);
      console.log(`[L2DTranslator] Auto-translating text to expressions: ${targetText.slice(0, 40)}... ->`, enrichment.animations);
      return {
        ...context,
        animations: enrichment.animations,
        moodImpact: {
          ...(context.moodImpact || {}),
          ...enrichment.moodImpact
        }
      };
    }
    return context;
  }
};
