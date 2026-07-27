import { Soul } from '../soul';
import { Cortex } from '../cortex';

export interface NeuralCircuitConfig {
  id: string;
  name: string;
  intervalMs: number;
  description: string;
}

export abstract class NeuralCircuit {
  public abstract readonly config: NeuralCircuitConfig;
  protected logs: string[] = [];

  constructor(protected soul: Soul, protected cortex: Cortex) {}

  public abstract execute(): Promise<void>;

  protected log(message: string) {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.push(`[${this.config.name}][${timestamp}] ${message}`);
    if (this.logs.length > 50) this.logs.shift();
  }

  public getLogs() {
    return [...this.logs];
  }
}

/**
 * Pengatur dan Pengendali Sirkuit Saraf Batin (Neural Circuit Manager) untuk Yuihime
 */
export class NeuralCircuitManager {
  private circuits: Map<string, NeuralCircuit> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(private soul: Soul, private cortex: Cortex) {}

  public register(circuit: NeuralCircuit) {
    this.circuits.set(circuit.config.id, circuit);
    console.log(`[NEURAL_CIRCUIT] Sirkuit saraf batin terdaftar: ${circuit.config.name}`);
  }

  public startAll() {
    this.circuits.forEach(circuit => {
      if (this.intervals.has(circuit.config.id)) return;
      
      const interval = setInterval(() => {
        circuit.execute().catch(err => console.error(`Sirkuit ${circuit.config.id} gagal dieksekusi:`, err));
      }, circuit.config.intervalMs);
      
      this.intervals.set(circuit.config.id, interval);
      this.logSystem(`Sirkuit saraf batin [${circuit.config.name}] mulai berdenyut otonom.`);
    });
  }

  public stopAll() {
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals.clear();
  }

  private logSystem(msg: string) {
    console.log(`[NEURAL_SYSTEM] ${msg}`);
  }

  public getStatus() {
    return Array.from(this.circuits.values()).map(circuit => ({
      ...circuit.config,
      isRunning: this.intervals.has(circuit.config.id),
      logs: circuit.getLogs()
    }));
  }
}
