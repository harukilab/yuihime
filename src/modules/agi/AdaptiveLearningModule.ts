import { CortexModule, ModuleType, AgentState, AdaptiveAction, QTable } from '../../include/types';
import { StorageService } from '../../drivers/storage';

/**
 * AdaptiveLearningModule
 * 
 * A reinforcement learning engine (Q-Learning) implemented in TypeScript,
 * mirroring the neural core logic for adaptive learning.
 * 
 * This module enables the agent to learn which behavioral actions lead to 
 * positive user interactions (joy/satisfaction) and avoid those that 
 * increase stress/frustration.
 */

class AdaptiveEngine {
  private alpha = 0.1; // Learning rate
  private gamma = 0.9; // Discount factor
  private epsilon = 0.2; // Exploration rate
  private qTable: QTable = {};

  async init() {
    const saved = await StorageService.getCustom('yuihime_q_table');
    if (saved) this.qTable = saved;
  }

  private getStateBucket(state: AgentState): string {
    const mood = state.mood;
    // Find highest mood value
    let maxLabel = 'neutral';
    let maxVal = -1;
    for (const [k, v] of Object.entries(mood)) {
      if (typeof v === 'number' && v > maxVal && k !== 'lastUpdate') {
        maxVal = v;
        maxLabel = k;
      }
    }
    
    const energy = state.energy > 60 ? 'high' : (state.energy > 30 ? 'mid' : 'low');
    return `${maxLabel}_${energy}`;
  }

  async selectAction(state: AgentState): Promise<AdaptiveAction> {
    const stateKey = this.getStateBucket(state);
    const actions = Object.values(AdaptiveAction) as AdaptiveAction[];

    // Epsilon-greedy exploration
    if (Math.random() < this.epsilon) {
      return actions[Math.floor(Math.random() * actions.length)];
    }

    let bestAction = actions[0];
    let maxQ = -Infinity;

    for (const action of actions) {
      const q = this.qTable[`${stateKey}:${action}`] || 0;
      if (q > maxQ) {
        maxQ = q;
        bestAction = action;
      }
    }

    return bestAction;
  }

  async update(state: AgentState, action: AdaptiveAction, reward: number, nextState: AgentState) {
    const stateKey = this.getStateBucket(state);
    const nextStateKey = this.getStateBucket(nextState);
    const currentKey = `${stateKey}:${action}`;
    
    const currentQ = this.qTable[currentKey] || 0;
    
    // Max Q for next state
    const actions = Object.values(AdaptiveAction) as AdaptiveAction[];
    let maxNextQ = -Infinity;
    for (const nextAction of actions) {
      const q = this.qTable[`${nextStateKey}:${nextAction}`] || 0;
      if (q > maxNextQ) maxNextQ = q;
    }

    // TD Update rule: Q(s,a) = Q(s,a) + alpha * [reward + gamma * max(Q(s',a')) - Q(s,a)]
    const newQ = currentQ + this.alpha * (reward + this.gamma * (maxNextQ === -Infinity ? 0 : maxNextQ) - currentQ);
    
    this.qTable[currentKey] = newQ;
    await StorageService.saveCustom('yuihime_q_table', this.qTable);
  }
}

const engine = new AdaptiveEngine();
engine.init();

export const AdaptiveLearningModule: CortexModule = {
  metadata: {
    id: 'adaptive-learning',
    name: 'yui-plugin-bridge: ARS Kernel',
    description: 'Autonomous Reinforcement Strategy kernel for optimizing behavior updates.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 2,
    phase: 'pre-process'
  },
  run: async (input, state, context) => {
    // 1. Determine Reward from the last interaction's mood impact
    // If the mood analyzer (ran in pre-process) found joy, that's positive reward
    const moodShift = context?.moodShift || { joy: 0, stress: 0 };
    // Integration: Add dreamReward if present (from simulated learning)
    const dReward = context?.dreamReward || 0;
    const reward = (moodShift.joy || 0) * 1.0 - (moodShift.stress || 0) * 1.5 + dReward;

    // 2. Load previous state-action pair (we need a way to track what we did last time)
    const lastSession = await StorageService.getCustom('yuihime_last_rl_session');
    
    if (lastSession) {
      // Update Q-Table with the result of the LAST action
      await engine.update(lastSession.state, lastSession.action, reward, state);
    }

    // 3. Select Action for THIS interaction
    const action = await engine.selectAction(state);

    // 4. Save Session for next time
    await StorageService.saveCustom('yuihime_last_rl_session', { state, action });

    // 5. Apply behavioral modifiers based on selected action
    let behavioralMod: any = {};
    
    switch (action) {
      case AdaptiveAction.SHIFT_TONE_WARM:
        behavioralMod.toneOverride = { emotionalBias: 'gentle', pitch: 1.1 };
        break;
      case AdaptiveAction.SHIFT_TONE_ANALYTICAL:
        behavioralMod.toneOverride = { emotionalBias: 'logical', pitch: 0.9 };
        break;
      case AdaptiveAction.SHIFT_TONE_ENERGETIC:
        behavioralMod.toneOverride = { emotionalBias: 'excited', speed: 1.2 };
        break;
      case AdaptiveAction.INCREASE_CONFIDENCE:
        behavioralMod.personalityShift = "More assertive, expert-focused.";
        break;
      case AdaptiveAction.DECREASE_CONFIDENCE:
        behavioralMod.personalityShift = "More humble, curious, asking for user input.";
        break;
      case AdaptiveAction.USE_DEEP_MEMORY:
         behavioralMod.memoryDepth = 'long-term';
         break;
      default:
        break;
    }

    return { 
      rlAction: action,
      behavioralMod,
      logs: [`[RL_KERNEL] Action Selected: ${action} (Reward: ${reward})`]
    };
  }
};
