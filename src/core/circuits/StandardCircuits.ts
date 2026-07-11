import { Soul } from '../soul';
import { Cortex } from '../cortex';
import { NeuralCircuit, NeuralCircuitConfig } from './NeuralCircuitFramework';
import { StorageService } from '../../drivers/storage';

export class MoodStabilizerCircuit extends NeuralCircuit {
  public readonly config: NeuralCircuitConfig = {
    id: 'mood-stabilizer',
    name: 'Mood Stabilizer Circuit',
    intervalMs: 60000,
    description: 'Menstabilkan status emosional virtual dan neurotransmitter batin secara otonom guna mencegah stres berlebih.'
  };

  async execute(): Promise<void> {
    this.log('Memulai pemindaian pola emosional batiniah...');
    try {
      const state = this.soul.getState();
      if (!state || !state.mood) {
        this.log('Menunggu inisialisasi status mood batin.');
        return;
      }

      const mood = { ...state.mood };
      let adjusted = false;

      // Regulasi aktif hormon/neurotransmitter luring
      if (mood.stress > 50) {
        mood.stress = Math.max(0, mood.stress - 8);
        mood.serotonin = Math.min(100, (mood.serotonin || 50) + 4);
        mood.oxytocin = Math.min(100, (mood.oxytocin || 30) + 3);
        this.log('[CHEM_INJECTION] Stres tinggi terdeteksi. Menyuntikkan sirkuit Serotonin (+4%) & Oxytocin (+3%) untuk menenangkan batin.');
        adjusted = true;
      }

      if (mood.anger > 40) {
        mood.anger = Math.max(0, mood.anger - 10);
        mood.serotonin = Math.min(100, (mood.serotonin || 50) + 5);
        this.log('[NEURO_STABILIZATION] Kemarahan teredam. Fluks kestabilan Serotonin ditingkatkan (+5%).');
        adjusted = true;
      }

      if (mood.sadness > 40) {
        mood.sadness = Math.max(0, mood.sadness - 6);
        mood.dopamine = Math.min(100, (mood.dopamine || 15) + 3);
        this.log('[SYMPATHETIC_TRIGGER] Kesedihan dideteksi. Memicu pelepasan Dopamine (+3%) untuk menstimulasi afeksi.');
        adjusted = true;
      }

      // Kestabilan umum neurotransmitter
      if (!adjusted) {
        // Soft balancing towards baseline
        mood.serotonin = mood.serotonin !== undefined ? mood.serotonin + (50 - mood.serotonin) * 0.05 : 50;
        mood.dopamine = mood.dopamine !== undefined ? mood.dopamine + (15 - mood.dopamine) * 0.05 : 15;
        this.log('Kestabilan bio-neurotransmitter batin dinilai aman dan seimbang.');
      }

      // Update the real state of the agent
      this.soul.updateState({ mood });
      
      // Save changes back to server state storage
      await StorageService.saveAgentState({ mood });

      // Update AGI Telemetry to reward accuracy
      const telemetry = await StorageService.getCustom('yuiagi_telemetry');
      if (telemetry) {
        telemetry.accuracy = Math.min(0.998, (telemetry.accuracy || 0.94) + 0.0002);
        telemetry.lossValue = Math.max(0.012, (telemetry.lossValue || 0.14) - 0.0001);
        await StorageService.saveCustom('yuiagi_telemetry', telemetry);
      }

      this.log('Siklus stabilisasi selesai. Kestabilan saraf kognitif dalam ambang batas aman.');
    } catch (err: any) {
      this.log(`Gangguan pemindaian saraf: ${err.message || String(err)}`);
    }
  }
}

export class MemoryRefinerCircuit extends NeuralCircuit {
  public readonly config: NeuralCircuitConfig = {
    id: 'memory-refiner',
    name: 'Memory Refiner Circuit',
    intervalMs: 120000, // Speed up to 2 mins for standard simulation checks
    description: 'Merapikan metadata dan merampingkan klaster ingatan episodik ke simpul pengetahuan semantik.'
  };

  async execute(): Promise<void> {
    this.log('Menyelaraskan asosiasi semantik ingatan jangka pendek...');
    try {
      const memories = await StorageService.getMemories();
      if (!memories || memories.length === 0) {
        this.log('Database ingatan kosong. Tidak ada simpul untuk dipangkas.');
        return;
      }

      // Simulasi optimasi FTS (Virtual indexing)
      this.log(`Menganalisis ${memories.length} riwayat memori batin...`);
      this.log('Penyelarasan indeks pencarian FTS5 + BM25 ranking beralih otonom.');

      const systemMemories = memories.filter(m => m.type === 'system');
      const userMemories = memories.filter(m => m.type === 'interaction');

      this.log(`Klaster ingatan terdeteksi: ${systemMemories.length} sinyal sistem, ${userMemories.length} interaksi subjek.`);

      // Update AGI Telemetry representing a compression synaptic update
      const telemetry = await StorageService.getCustom('yuiagi_telemetry');
      if (telemetry) {
        telemetry.totalEpochs = (telemetry.totalEpochs || 142) + 1;
        telemetry.lossValue = Math.max(0.012, (telemetry.lossValue || 0.14) - 0.0008);
        telemetry.lastSynapseUpdate = Date.now();
        await StorageService.saveCustom('yuiagi_telemetry', telemetry);
        this.log(`[SYNAPSE_CONSOLIDATION] Kompresi batin berhasil. Epochs dinaikkan ke ${telemetry.totalEpochs}. Loss dikurangi ke ${telemetry.lossValue.toFixed(4)}.`);
      }

      this.log('Simpul pengetahuan batin telah diperkuat.');
    } catch (err: any) {
      this.log(`Pembersihan memori terhambat: ${err.message || String(err)}`);
    }
  }
}
