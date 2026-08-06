import { CortexModule, ModuleType } from '@shared/include/types';
import { runHighOrderMetacognition } from './HighOrderMetacognitionModule';
import { runSelfAwarenessMirror } from './SelfAwarenessMirrorModule';

/**
 * Looped reflection modules for the reflect cortex phase (Area 2).
 *
 * These reuse the exact same run logic as the SOUL-phase metacognition and
 * self-awareness modules, but execute *inside* the ReAct loop (per iteration)
 * so they can audit the live loop state (tool execution history) instead of
 * guessing upfront. Only active when `enableLoopedReflection` is ON in the
 * global `yuiagi-reasoning` config, so the default path is unchanged.
 *
 * Auto-discovered by the registry glob (no manual registration).
 */

export const MetacognitionReflectModule: CortexModule = {
  metadata: {
    id: 'high-order-metacognition-reflect',
    name: 'yui-high-metacognition: Loop Reflection',
    description: 'Per-iteration meta-cognitive self-critique executed inside the ReAct loop (reflect phase).',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 14,
    phase: 'reflect',
    configSchema: {
      fields: {
        enableMetacognition: { type: 'boolean', label: 'Enable Meta-Cognition Layer', default: true }
      }
    }
  },
  run: runHighOrderMetacognition
};

export const SelfAwarenessReflectModule: CortexModule = {
  metadata: {
    id: 'self-awareness-mirror-reflect',
    name: 'yui-self-awareness-mirror: Loop Reflection',
    description: 'Per-iteration self-awareness mirroring executed inside the ReAct loop (reflect phase).',
    version: '2.1.0',
    type: ModuleType.CORTEX,
    order: 11,
    phase: 'reflect',
    configSchema: {
      fields: {
        enableMirror: { type: 'boolean', label: 'Enable Self-Awareness Mirror', default: true }
      }
    }
  },
  run: runSelfAwarenessMirror
};
