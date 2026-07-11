import { CortexModule, ModuleType } from '../include/types';

export const MoodAnalysisModule: CortexModule = {
  metadata: {
    id: 'mood-analyzer',
    name: 'Emotional Intelligence',
    description: 'Analyzes user sentiment to adjust internal mood state.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 1,
    phase: 'pre-process'
  },
  run: async (input: string, state: any, context: any) => {
    const stressKeywords = ['bad', 'hate', 'stupid', 'bored', 'angry', 'error', 'wrong'];
    const joyKeywords = ['good', 'love', 'happy', 'cool', 'amazing', 'perfect', 'thanks'];
    
    let shift: Record<string, number> = { joy: 0, stress: 0, anger: 0, sadness: 0, irritation: 0, excitement: 0, playfulness: 0 };
    const lowerInput = (input || "").toLowerCase();
    
    stressKeywords.forEach(w => { if (lowerInput.includes(w)) shift.stress += 5; });
    joyKeywords.forEach(w => { if (lowerInput.includes(w)) shift.joy += 5; });
    
    const globalSettings = context?.config || {};
    const emotionRegexRules = globalSettings.emotionRegexRules || [];
    
    let isOverridden = false;
    const customShifts: Record<string, number> = { joy: 0, stress: 0, anger: 0, sadness: 0, irritation: 0, excitement: 0, playfulness: 0 };
    let matchesCount = 0;

    if (Array.isArray(emotionRegexRules)) {
      for (const rule of emotionRegexRules) {
        if (!rule.pattern) continue;
        try {
          const regex = new RegExp(rule.pattern, 'i');
          if (regex.test(lowerInput)) {
            matchesCount++;
            if (rule.isPriority) {
              isOverridden = true;
            }
            const ruleSensitivity = typeof rule.sensitivity === 'number' ? rule.sensitivity : 1.0;
            if (rule.moodImpact && typeof rule.moodImpact === 'object') {
              for (const [mName, val] of Object.entries(rule.moodImpact)) {
                if (typeof val === 'number') {
                  const shiftVal = Math.round(val * ruleSensitivity);
                  customShifts[mName] = (customShifts[mName] || 0) + shiftVal;
                }
              }
            }
          }
        } catch (err) {
          // Gracefully handle invalid regex patterns
        }
      }
    }

    if (matchesCount > 0) {
      if (isOverridden) {
        shift = customShifts;
      } else {
        for (const [mName, val] of Object.entries(customShifts)) {
          shift[mName] = (shift[mName] || 0) + val;
        }
      }
    }
    
    return { moodShift: shift };
  }
};
