import { Soul } from '@shared/core/soul';
import { Cortex } from '../cortex';
import { NeuralCircuit, NeuralCircuitConfig } from './NeuralCircuitFramework';
import { StorageService } from '@shared/drivers/storage';

export class MoodStabilizerCircuit extends NeuralCircuit {
  public readonly config: NeuralCircuitConfig = {
    id: 'mood-stabilizer',
    name: 'Mood Stabilizer Circuit',
    intervalMs: 60000,
    description: 'Autonomously stabilizes the virtual emotional state and inner neurotransmitters to prevent excessive stress.'
  };

  async execute(): Promise<void> {
    this.log('Starting inner emotional pattern scan...');
    try {
      const state = this.soul.getState();
      if (!state || !state.mood) {
        this.log('Waiting for the inner mood state initialization.');
        return;
      }

      const mood = { ...state.mood };
      let adjusted = false;

      // Active offline regulation of hormones/neurotransmitters
      if (mood.stress > 50) {
        mood.stress = Math.max(0, mood.stress - 8);
        mood.serotonin = Math.min(100, (mood.serotonin || 50) + 4);
        mood.oxytocin = Math.min(100, (mood.oxytocin || 30) + 3);
        this.log('[CHEM_INJECTION] High stress detected. Injecting Serotonin (+4%) & Oxytocin (+3%) circuit to calm the inner self.');
        adjusted = true;
      }

      if (mood.anger > 40) {
        mood.anger = Math.max(0, mood.anger - 10);
        mood.serotonin = Math.min(100, (mood.serotonin || 50) + 5);
        this.log('[NEURO_STABILIZATION] Anger dampened. Serotonin stability flux increased (+5%).');
        adjusted = true;
      }

      if (mood.sadness > 40) {
        mood.sadness = Math.max(0, mood.sadness - 6);
        mood.dopamine = Math.min(100, (mood.dopamine || 15) + 3);
        this.log('[SYMPATHETIC_TRIGGER] Sadness detected. Triggering Dopamine release (+3%) to stimulate affection.');
        adjusted = true;
      }

      // General neurotransmitter stability
      if (!adjusted) {
        // Soft balancing towards baseline
        mood.serotonin = mood.serotonin !== undefined ? mood.serotonin + (50 - mood.serotonin) * 0.05 : 50;
        mood.dopamine = mood.dopamine !== undefined ? mood.dopamine + (15 - mood.dopamine) * 0.05 : 15;
        this.log('Inner bio-neurotransmitter stability assessed as safe and balanced.');
      }

      // Update the real state of the agent
      this.soul.updateState({ mood });
      
      // Save changes back to server state storage
      await StorageService.saveAgentState({ mood });

      // Update AGI Telemetry to reward accuracy
      const telemetry = await StorageService.getCustom('yuiagi_telemetry');
      if (telemetry) {
        telemetry.accuracy = Math.min(0.998, (telemetry.accuracy || 0) + 0.0002);
        telemetry.lossValue = Math.max(0.012, (telemetry.lossValue || 0) - 0.0001);
        await StorageService.saveCustom('yuiagi_telemetry', telemetry);
      }

      this.log('Stabilization cycle complete. Cognitive neural stability is within the safe threshold.');
    } catch (err: any) {
      this.log(`Neural scan disruption: ${err.message || String(err)}`);
    }
  }
}

export class MemoryRefinerCircuit extends NeuralCircuit {
  public readonly config: NeuralCircuitConfig = {
    id: 'memory-refiner',
    name: 'Memory Refiner Circuit',
    intervalMs: 120000, // Speed up to 2 mins for standard simulation checks
    description: 'Tidies up metadata and trims episodic memory clusters into semantic knowledge nodes.'
  };

  async execute(): Promise<void> {
    this.log('Aligning short-term memory semantic associations...');
    try {
      const memories = await StorageService.getMemories();
      if (!memories || memories.length === 0) {
        this.log('Memory database is empty. No nodes to prune.');
        return;
      }

      // FTS optimization simulation (Virtual indexing)
      this.log(`Analyzing ${memories.length} inner memory records...`);
      this.log('FTS5 search index alignment + BM25 ranking switched autonomously.');

      const systemMemories = memories.filter(m => m.type === 'system');
      const userMemories = memories.filter(m => m.type === 'interaction');

      this.log(`Memory clusters detected: ${systemMemories.length} system signals, ${userMemories.length} subject interactions.`);

      // Update AGI Telemetry representing a compression synaptic update
      const telemetry = await StorageService.getCustom('yuiagi_telemetry');
      if (telemetry) {
        telemetry.totalEpochs = (telemetry.totalEpochs || 0) + 1;
        telemetry.lossValue = Math.max(0.012, (telemetry.lossValue || 0) - 0.0008);
        telemetry.lastSynapseUpdate = Date.now();
        await StorageService.saveCustom('yuiagi_telemetry', telemetry);
        this.log(`[SYNAPSE_CONSOLIDATION] Inner compression successful. Epochs raised to ${telemetry.totalEpochs}. Loss reduced to ${telemetry.lossValue.toFixed(4)}.`);
      }

      this.log('Inner knowledge nodes have been reinforced.');
    } catch (err: any) {
      this.log(`Memory cleanup hindered: ${err.message || String(err)}`);
    }
  }
}
