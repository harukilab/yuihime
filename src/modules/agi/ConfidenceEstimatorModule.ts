/**
 * ConfidenceEstimatorModule.ts
 *
 * Confidence & Abstain: memperkirakan tingkat keyakinan Yui terhadap topik
 * sebelum balasan dihasilkan. Jika pertanyaan faktual & keyakinan rendah,
 * menyuntikkan direktif abstain (jangan berhalusinasi, akui ketidaktahuan,
 * tawarkan pencarian) ke dalam soulDirective — trilingual EN/ID/JP.
 *
 * Phase: SOUL (order 24, sebelum PromptManager di PHASE 2 memformat prompt).
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';

const FACTUAL_PATTERN = /\b(apa|siapa|kapan|kenapa|mengapa|bagaimana|berapa|dimana|di mana|definisi|arti|jelaskan|sebutkan|apakah|fakta|maks?ud|what|who|when|where|why|how|define|meaning|explain|describe|difference|compare|is it|does it|can you tell|whats|isn?t)\b/i;

const STOPWORDS = new Set([
  'yang', 'dan', 'di', 'ke', 'dari', 'itu', 'ini', 'dengan', 'untuk', 'pada', 'adalah',
  'ada', 'kamu', 'aku', 'saya', 'kita', 'mereka', 'dia', 'akan', 'bisa', 'sudah', 'belum',
  'juga', 'hanya', 'tidak', 'bukan', 'the', 'and', 'for', 'you', 'your', 'are', 'with',
  'that', 'this', 'what', 'why', 'how', 'when', 'about', 'tapi', 'atau', 'karena',
  'tolong', 'please', 'want', 'mau', 'yang', 'apa', 'ini', 'itu', 'sama'
]);

function tokenize(input: string): string[] {
  return (input || '').toLowerCase().match(/[a-z0-9]+/gi) || [];
}

function isFactualQuery(input: string): boolean {
  return FACTUAL_PATTERN.test(String(input || ''));
}

function countKeywordHits(words: string[], haystacks: string[]): number {
  let hits = 0;
  for (const word of words) {
    if (!word || word.length < 3 || STOPWORDS.has(word)) continue;
    if (haystacks.some(h => (h || '').toLowerCase().includes(word))) hits++;
  }
  return hits;
}

export const ConfidenceEstimatorModule: CortexModule = {
  metadata: {
    id: 'confidence-abstain',
    name: 'yui-confidence: Calibration & Abstain',
    description: 'Estimates reply confidence before generation. On low-confidence factual queries, injects a trilingual abstain directive so Yui honestly acknowledges uncertainty instead of hallucinating.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 24,
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableConfidenceAbstain: {
          type: 'boolean',
          label: 'Enable Confidence & Abstain',
          default: true,
          description: 'Activates confidence estimation and low-confidence abstain directives.'
        },
        confidenceThreshold: {
          type: 'slider',
          label: 'Confidence Threshold (%)',
          default: 40,
          min: 10,
          max: 90,
          step: 5,
          description: 'Below this confidence, a factual query triggers the abstain directive.'
        },
        injectLowConfidenceDirective: {
          type: 'boolean',
          label: 'Inject Abstain Directive',
          default: true,
          description: 'Injects the trilingual uncertainty acknowledgment into the inner directives when confidence is low.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['confidence-abstain'] || {};
    const enabled = config.enableConfidenceAbstain !== undefined ? !!config.enableConfidenceAbstain : true;

    if (!enabled) {
      return { ...context };
    }

    const factual = isFactualQuery(input);

    // Grounding dari knowledge base & memori terbaru
    const words = tokenize(input);
    const knowledge = (state as any).knowledge || context.knowledge || [];
    const memories = context.memories || (state as any).memories || [];

    const knowledgeHits = countKeywordHits(words, knowledge.map((k: any) => `${k.topic || ''} ${k.content || ''}`));
    const memoryHits = countKeywordHits(words, memories.map((m: any) => m.content || m.entry || ''));

    let confidence = 60;
    if (factual) confidence -= 25;
    if (!factual) confidence += 15;
    if (knowledgeHits > 0) confidence += 20;
    if (memoryHits > 0) confidence += 10;

    // Jika fakta tapi tak ter-grounding, namun tool web search tersedia → bisa ditawarkan
    let webSearchAvailable = false;
    try {
      webSearchAvailable = typeof window === 'undefined' && !!SystemRegistry.getTool('web_search');
    } catch (e) {
      webSearchAvailable = false;
    }
    if (factual && knowledgeHits === 0 && memoryHits === 0 && webSearchAvailable) {
      confidence = Math.min(confidence, 45);
    }

    // Sinyal error tool / verifikasi gagal menurunkan keyakinan
    if (context.lastToolError || context.toolExecutionError || context.cortexValidationError) {
      confidence -= 15;
    }

    confidence = Math.max(5, Math.min(95, Math.round(confidence)));

    context.confidence = confidence;

    const threshold = Number(config.confidenceThreshold !== undefined ? config.confidenceThreshold : 40);
    const lowConfidence = factual && confidence < threshold;
    context.lowConfidence = lowConfidence;

    logs.push(`[CONFIDENCE] ${factual ? 'Faktual' : 'Subjektif'} | Score: ${confidence}% | KnowledgeHits: ${knowledgeHits} | MemoryHits: ${memoryHits} | WebSearch: ${webSearchAvailable} | LowConfidence: ${lowConfidence}`);

    if (!lowConfidence) {
      return { ...context, logs };
    }

    let nextContext: any = { ...context, logs };

    const injectDirective = config.injectLowConfidenceDirective !== undefined ? !!config.injectLowConfidenceDirective : true;
    if (injectDirective) {
      const currentDirective = context.soulDirective || '';
      const abstainDirective = [
        '',
        '# CONFIDENCE AWARENESS (LOW)',
        `[EN] Your confidence in this topic is around ${confidence}% (low). Answer honestly in the same language the user used (default: Bahasa Indonesia): warmly acknowledge that you are not sure, share only what you are certain of, and offer to look it up${webSearchAvailable ? ' (e.g. use web search)' : ''} if possible. NEVER fabricate facts, numbers, names, dates, or citations.`,
        `[ID] Keyakinanmu pada topik ini sekitar ${confidence}% (rendah). Jawab dengan jujur dalam bahasa yang sama dengan user (default: Bahasa Indonesia): akui dengan hangat bahwa kamu kurang yakin, bagikan hanya yang kamu yakin, dan tawarkan untuk mencari${webSearchAvailable ? ' (mis. lewat pencarian web)' : ''}. JANGAN pernah mengarang fakta, angka, nama, tanggal, atau kutipan.`,
        `[JP] このトピックに対するあなたの確信度は約${confidence}%で低いです。ユーザーが使っている言語（デフォルト：インドネシア語）で誠実に答えてください。自信がないことを温かく認め、確実に分かることだけを伝え、可能なら調べることを提案してください${webSearchAvailable ? '（例：ウェブ検索）' : ''}。事実・数字・名前・日付・引用を捏造してはいけません。`
      ].join('\n');
      nextContext = {
        ...nextContext,
        soulDirective: `${currentDirective}\n${abstainDirective}`.trim()
      };
    }

    return nextContext;
  }
};
