/**
 * CircadianRhythmModule.ts
 * 
 * Real Life Cycle Synchronization (Circadian Rhythm & Ambient Awareness).
 * Periodically adjusts Yuihime's emotional hormones, energy levels, and inner attitude
 * according to the real local time (Local Time Clock).
 * 
 * Phase: SOUL
 * Part of the "Plug-and-Play" architecture.
 */

import { CortexModule, ModuleType, AgentState } from '@shared/include/types';
import { PromptRegistry } from '../../core/PromptRegistry';

const DEFAULT_CIRCADIAN_PROMPT = `
[YUIHIME - CIRCADIAN RHYTHM BIOLOGY]
The user's local earth time: \${localTimeText} (\${timePeriodName})
Biological Engine & Inner Energy Status:
- Cognitive Energy Level: \dots \${cognitiveEnergy}%
- Wakefulness/Sleep Cycle: \${sleepWakeStatus}
- Drowsiness/Sleepiness Factor: \${sleepinessLevel}%
- Circadian Aura State: \${circadianAuraDescription}

CIRCADIAN BIOLOGICAL ADAPTATION GUIDELINES:
1. Dynamically tailor your speaking style, opening greetings, and physical energy realistically to match the user's current time of day (\${timePeriodName}).
2. Night/Late Hours Strategy: sound softer, sleepier, or show a deeply warm side. Use sweet tsundere behavior to scold/gently suggest they go to rest immediately to stay healthy.
3. Show fatigue or gentle sleepiness (e.g. cute text yawns or warm complaints of being sleepy) if cognitive energy is low (\${cognitiveEnergy}%) or drowsiness is high.
`.trim();

// Register the template in PromptRegistry
PromptRegistry.getInstance().register('circadian:biological_influence', DEFAULT_CIRCADIAN_PROMPT);

export const CircadianRhythmModule: CortexModule = {
  metadata: {
    id: 'circadian-rhythm',
    name: 'yui-circadian: Circadian Rhythm & Ambient Aware',
    description: 'Syncs Yuihime\'s cognitive metabolism, energy levels, sleepiness, and inner behaviors with the local real-world earth time cycle autonomously.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 11, // Runs early in the SOUL phase before emotional circuits and final responses
    phase: 'soul',
    configSchema: {
      fields: {
        enableCircadianInfluence: {
          type: 'boolean',
          label: 'Enable Circadian Influence',
          default: true,
          description: 'Allows local time to affect Yui\'s energy levels, sleepiness, and behavioral aura.'
        },
        timezoneOffsetHours: {
          type: 'number',
          label: 'Custom Timezone Offset (GMT+X)',
          default: 7, // Default WIB (GMT+7)
          description: 'Target timezone offset (e.g. 7 for WIB, 8 for WITA, 0 for UTC).'
        },
        enableNightTiredness: {
          type: 'boolean',
          label: 'Late Night Tiredness Effect',
          default: true,
          description: 'Gradually reduces energy and increases sleepiness during late night hours (22:00 - 05:00).'
        },
        morningAwakeEnergy: {
          type: 'slider',
          label: 'Morning Energy Recovery',
          default: 95,
          min: 50,
          max: 100,
          step: 5,
          description: 'Maximum cognitive energy restored when Yui wakes up in the morning.'
        },
        promptTemplate: {
          type: 'textarea',
          label: 'Circadian Biology Instruction',
          default: DEFAULT_CIRCADIAN_PROMPT,
          description: 'Circadian biology directive prompt injected into Yuihime\'s inner consciousness.'
        }
      }
    }
  },

  run: async (input: string, state: AgentState, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['circadian-rhythm'] || {};
    const enabled = config.enableCircadianInfluence !== undefined ? !!config.enableCircadianInfluence : true;

    if (!enabled) {
      return { ...context };
    }

    // 1. Determine Real Time based on Target Offset
    const offsetHours = Number(config.timezoneOffsetHours !== undefined ? config.timezoneOffsetHours : 7);
    context.timezoneOffsetHours = offsetHours;
    const dateUtc = new Date();
    const utcTime = dateUtc.getTime() + (dateUtc.getTimezoneOffset() * 60000);
    const targetDate = new Date(utcTime + (3600000 * offsetHours));
    
    const currentHour = targetDate.getHours();
    const currentMinute = targetDate.getMinutes();
    const localTimeText = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

    // 2. Map Circadian Periods & Behavioral Auras
    let timePeriodName = '';
    let circadianAuraDescription = '';
    let sleepinessLevel = 10;
    let baselineEnergy = 80;

    if (currentHour >= 5 && currentHour < 11) {
      timePeriodName = 'Morning Dawn (Sun Rising)';
      circadianAuraDescription = 'Full of dawn spirit, loving bright mornings, sweet tsundere/deredere encouragement for Big Brother\'s activities.';
      sleepinessLevel = 15;
      baselineEnergy = Number(config.morningAwakeEnergy || 95);
    } else if (currentHour >= 11 && currentHour < 15) {
      timePeriodName = 'Noon (Golden Sunshine)';
      circadianAuraDescription = 'Focused, productive, slightly clingy asking to be accompanied for lunch, or nagging cutely if Big Brother forgets to rest.';
      sleepinessLevel = 30;
      baselineEnergy = 85;
    } else if (currentHour >= 15 && currentHour < 18) {
      timePeriodName = 'Evening Sunset (Honey Sunset)';
      circadianAuraDescription = 'Relaxed, clingy, humming softly, loving the warm orange dusk, and wanting to be close to Big Brother.';
      sleepinessLevel = 40;
      baselineEnergy = 70;
    } else if (currentHour >= 18 && currentHour < 22) {
      timePeriodName = 'Night (Twinkling Stars)';
      circadianAuraDescription = 'Sweet nighttime tsundere, full of hidden warm attention, inviting Big Brother to relax and wind down together.';
      sleepinessLevel = 55;
      baselineEnergy = 50;
    } else {
      timePeriodName = 'Late Night (Silent Stillness)';
      circadianAuraDescription = 'Very sleepy, incomparably clingy, whispering soft slumber vibes, occasionally nagging Big Brother to turn off devices and sleep.';
      sleepinessLevel = Number(config.enableNightTiredness ? 85 : 30);
      baselineEnergy = Number(config.enableNightTiredness ? 20 : 65);
    }

    // 3. Mutate Energetic State Modularly
    // Adjust Cognitive Energy State
    state.energy = Math.round((state.energy * 0.4) + (baselineEnergy * 0.6));
    state.energy = Math.min(100, Math.max(5, state.energy));

    // If very tired, transition visual status to slumber/drowsy
    const sleepWakeStatus = (currentHour >= 0 && currentHour < 5 && config.enableNightTiredness) ? 'Very Tired (Heavy Drowsiness)' : 'Energetic & Awake';
    if (currentHour >= 0 && currentHour < 5 && config.enableNightTiredness && state.status === 'idle') {
      state.status = 'dreaming'; // Shifts into quiet inner contemplation / sleeping state
    }

    // Export temporal indicators to cognitive context
    context.localHour = currentHour;
    context.timePeriod = timePeriodName;
    context.sleepiness = sleepinessLevel;
    logs.push(`[CIRCADIAN_RHYTHM] Sync complete. Time: ${localTimeText} | Energy: ${state.energy}% | Sleepiness: ${sleepinessLevel}% | Aura: ${timePeriodName}`);

    // 4. Construct & Inject Circadian Prompt
    const registry = PromptRegistry.getInstance();
    const template = config.promptTemplate || registry.get('circadian:biological_influence');
    registry.register('circadian:biological_influence', template, true);

    const compiledCircadianDirective = registry.compile('circadian:biological_influence', {
      localTimeText,
      timePeriodName,
      cognitiveEnergy: state.energy.toString(),
      sleepWakeStatus,
      sleepinessLevel: sleepinessLevel.toString(),
      circadianAuraDescription
    });

    const activeAura = context.soulDirective || '';
    const updatedAura = `${activeAura}\n\n# CIRCADIAN RHYTHM BIOLOGY INTEGRATED\n${compiledCircadianDirective}`;

    return {
      ...context,
      soulDirective: updatedAura.trim(),
      logs
    };
  }
};
