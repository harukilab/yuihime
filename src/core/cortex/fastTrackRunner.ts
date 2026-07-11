/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AgentState } from '../../include/types';
import { Soul } from '../soul';

export class FastTrackRunner {
  private static fastTrackWorker: any = null;
  private static activePromises: Map<string, { resolve: (val: any) => void; reject: (err: Error) => void }> = new Map();
  private static updateMoodStmt: any = null;
  private static insertTelemetryStmt: any = null;
  private static lastMoodDbWriteTime: number = 0;
  private static lastTelemetryFlushTime: number = 0;
  private static telemetryBuffer: any[] = [];
  private static workerIdleTimeout: NodeJS.Timeout | null = null;

  public static async run(
    config: any,
    state: AgentState,
    telemetryData?: { operation: string; latency: number; success: boolean; context?: string }
  ): Promise<any> {
    const isNode = typeof window === 'undefined';
    
    let decayedMood = state.mood;
    let telemetryResult: any = null;

    if (isNode) {
      try {
        const workerThreadsPath = 'worker_threads';
        const { Worker } = await import(/* @vite-ignore */ workerThreadsPath);

        // Lazily initialize singleton worker
        if (!this.fastTrackWorker) {
          const workerCode = `
            const { parentPort } = require('worker_threads');
            
            parentPort.on('message', (message) => {
              try {
                const { id, type, data } = message;
                if (type === 'FAST_TRACK_ALL') {
                  const { mood, config, telemetry } = data;
                  
                  // 1. Mood Decay
                  const now = Date.now();
                  const elapsedMinutes = (now - (mood.lastUpdate || now)) / 60000;
                  const decayRate = config?.decayRate || 0.5;
                  const baseline = config?.baselineMood || 10;
                  const decayAmount = elapsedMinutes * decayRate;
                  
                  const activeDopamine = mood.dopamine !== undefined ? mood.dopamine : 15;
                  const activeSerotonin = mood.serotonin !== undefined ? mood.serotonin : 50;
                  const activeOxytocin = mood.oxytocin !== undefined ? mood.oxytocin : 30;
                  const activeNoradrenaline = mood.noradrenaline !== undefined ? mood.noradrenaline : 10;

                  let sadnessDecayMult = 0.5;
                  if (mood.joy > 80) sadnessDecayMult = 2.0;
                  if (mood.stress > 70) sadnessDecayMult = 0.2;
                  if (activeSerotonin > 60) {
                    sadnessDecayMult *= (1.0 + (activeSerotonin - 50) / 20);
                  }

                  let irritationDecayMult = 1.0;
                  if (mood.stress > 60) irritationDecayMult = 0.3;
                  if (mood.joy > 70) irritationDecayMult = 2.5;
                  if (activeSerotonin > 60) {
                    irritationDecayMult *= (1.0 + (activeSerotonin - 50) / 30);
                  }
                  if (activeNoradrenaline > 40) {
                    irritationDecayMult *= Math.max(0.2, 1.0 - (activeNoradrenaline - 10) / 100);
                  }

                  const activeChastity = mood.chastity !== undefined ? mood.chastity : 80;
                  const activeTemperance = mood.temperance !== undefined ? mood.temperance : 70;
                  const activeCharity = mood.charity !== undefined ? mood.charity : 60;
                  const activeDiligence = mood.diligence !== undefined ? mood.diligence : 75;
                  const activePatience = mood.patience !== undefined ? mood.patience : 65;
                  const activeKindness = mood.kindness !== undefined ? mood.kindness : 80;
                  const activeHumility = mood.humility !== undefined ? mood.humility : 70;

                  const activeLust = mood.lust !== undefined ? mood.lust : 20;
                  const activeGluttony = mood.gluttony !== undefined ? mood.gluttony : 35;
                  const activeGreed = mood.greed !== undefined ? mood.greed : 15;
                  const activeSloth = mood.sloth !== undefined ? mood.sloth : 30;
                  const activeWrath = mood.wrath !== undefined ? mood.wrath : 20;
                  const activeEnvy = mood.envy !== undefined ? mood.envy : 25;
                  const activePride = mood.pride !== undefined ? mood.pride : 75;

                  const activeJealousy = mood.jealousy !== undefined ? mood.jealousy : 10;
                  const activeLoneliness = mood.loneliness !== undefined ? mood.loneliness : 15;
                  const activePlayfulness = mood.playfulness !== undefined ? mood.playfulness : 30;

                  const lerp = (cur, base, amt) => cur + (base - cur) * amt;
                  const factor = Math.min(0.5, elapsedMinutes * 0.02);
                  const fastFactor = Math.min(0.8, elapsedMinutes * 0.15);
                  const lonelinessIncrease = elapsedMinutes * (0.25 + (activeOxytocin > 50 ? 0.15 : 0));

                  const decayedMood = {
                    joy: Math.max(baseline, mood.joy - (decayAmount * 0.2)),
                    anger: Math.max(0, mood.anger - decayAmount),
                    sadness: Math.max(0, mood.sadness - (decayAmount * sadnessDecayMult)),
                    stress: Math.max(0, mood.stress - (decayAmount * 1.5 * (activeSerotonin > 60 ? 0.5 : 1.0))),
                    irritation: Math.max(0, mood.irritation - (decayAmount * irritationDecayMult)),
                    excitement: Math.max(0, mood.excitement - (decayAmount * 2.0 * (activeNoradrenaline > 50 ? 0.8 : 1.2))),
                    embarrassment: Math.max(0, mood.embarrassment - (decayAmount * 3.0)),
                    curiosity: Math.max(baseline, mood.curiosity - (decayAmount * 0.1)),
                    
                    jealousy: Math.max(0, activeJealousy - decayAmount * 0.5),
                    loneliness: Math.min(100, activeLoneliness + lonelinessIncrease),
                    playfulness: lerp(activePlayfulness, 30, factor),

                    dopamine: lerp(activeDopamine, 15, fastFactor),
                    serotonin: lerp(activeSerotonin, 50, factor),
                    oxytocin: lerp(activeOxytocin, 30, factor),
                    noradrenaline: lerp(activeNoradrenaline, 10, fastFactor),

                    chastity: lerp(activeChastity, 80, factor),
                    temperance: lerp(activeTemperance, 70, factor),
                    charity: lerp(activeCharity, 60, factor),
                    diligence: lerp(activeDiligence, 75, factor),
                    patience: lerp(activePatience, 65, factor),
                    kindness: lerp(activeKindness, 80, factor),
                    humility: lerp(activeHumility, 70, factor),

                    lust: lerp(activeLust, 20, factor),
                    gluttony: lerp(activeGluttony, 35, factor),
                    greed: lerp(activeGreed, 15, factor),
                    sloth: lerp(activeSloth, 30, factor),
                    wrath: lerp(activeWrath, 20, factor),
                    envy: lerp(activeEnvy, 25, factor),
                    pride: lerp(activePride, 75, factor),

                    lastUpdate: now
                  };
                  
                  // 2. Telemetry formatting
                  let telResult = null;
                  if (telemetry) {
                    telResult = {
                      timestamp: now,
                      operation: telemetry.operation,
                      latency: telemetry.latency,
                      success: telemetry.success ? 1 : 0,
                      context: telemetry.context || null
                    };
                  }
                  
                  parentPort.postMessage({
                    id,
                    success: true,
                    result: { decayedMood, telemetry: telResult }
                  });
                } else {
                  parentPort.postMessage({ id, success: false, error: 'Unknown operation type' });
                }
              } catch (err) {
                parentPort.postMessage({ id, success: false, error: err.message });
              }
            });
          `;

          this.fastTrackWorker = new Worker(workerCode, { eval: true });

          this.fastTrackWorker.on('message', (res: any) => {
            const { id, success, result, error } = res;
            const activePromise = this.activePromises.get(id);
            if (activePromise) {
              this.activePromises.delete(id);
              if (success) {
                activePromise.resolve(result);
              } else {
                activePromise.reject(new Error(error));
              }
            }
          });

          this.fastTrackWorker.on('error', (err: any) => {
            console.error("[CORTEX-FAST-TRACK-WORKER-ERR] Worker encountered error:", err);
            for (const [id, activePromise] of this.activePromises.entries()) {
              activePromise.reject(err);
              this.activePromises.delete(id);
            }
            this.fastTrackWorker = null;
          });

          this.fastTrackWorker.on('exit', (code: number) => {
            if (code !== 0) {
              console.warn(`[CORTEX-FAST-TRACK-WORKER-EXIT] Worker stopped with exit code ${code}`);
            }
            this.fastTrackWorker = null;
          });
        }

        // Resource Cleaning (Idle worker autoshutdown after 5 minutes of inactivity)
        if (this.workerIdleTimeout) {
          clearTimeout(this.workerIdleTimeout);
          this.workerIdleTimeout = null;
        }
        this.workerIdleTimeout = setTimeout(() => {
          if (this.fastTrackWorker) {
            console.log("[CORTEX-FAST-TRACK-RESOURCE] Persistent background worker shut down gracefully due to 5-minute idle inactivity.");
            this.fastTrackWorker.terminate();
            this.fastTrackWorker = null;
          }
        }, 300000);

        const requestId = `${Date.now()}_${Math.random()}`;

        const promise = new Promise<any>((resolve, reject) => {
          this.activePromises.set(requestId, { resolve, reject });
        });

        const safetyTimeout = setTimeout(() => {
          const activePromise = this.activePromises.get(requestId);
          if (activePromise) {
            this.activePromises.delete(requestId);
            activePromise.reject(new Error("Worker thread execution exceeded 200ms timeout threshold. Falling back to sync."));
          }
        }, 200);

        this.fastTrackWorker.postMessage({
          id: requestId,
          type: 'FAST_TRACK_ALL',
          data: {
            mood: state.mood,
            config: config?.soul,
            telemetry: telemetryData
          }
        });

        const workerResult = await promise;
        clearTimeout(safetyTimeout);
        decayedMood = workerResult.decayedMood;
        telemetryResult = workerResult.telemetry;

      } catch (err: any) {
        console.warn("[CORTEX-FAST-TRACK] Node worker thread fallback to sync:", err?.message || err);
        decayedMood = Soul.processDecay(state.mood, config?.soul);
        if (telemetryData) {
          telemetryResult = {
            timestamp: Date.now(),
            operation: telemetryData.operation,
            latency: telemetryData.latency,
            success: telemetryData.success ? 1 : 0,
            context: telemetryData.context || null
          };
        }
      }
    } else {
      try {
        decayedMood = Soul.processDecay(state.mood, config?.soul);
        if (telemetryData) {
          telemetryResult = {
            timestamp: Date.now(),
            operation: telemetryData.operation,
            latency: telemetryData.latency,
            success: telemetryData.success ? 1 : 0,
            context: telemetryData.context || null
          };
        }
      } catch (e: any) {
        console.warn("[CORTEX-FAST-TRACK] Browser fallback error:", e.message);
      }
    }

    // Now persist decayed mood and telemetry logging in the background (non-blocking)
    if (isNode) {
      (async () => {
        try {
          const dbModulePath = '../database.js';
          const { initializeDatabase } = await import(/* @vite-ignore */ dbModulePath);
          const db = initializeDatabase();
          
          if (db) {
            const now = Date.now();

            const shouldWriteMood = (now - this.lastMoodDbWriteTime) >= 15000;
            if (shouldWriteMood) {
              if (!this.updateMoodStmt) {
                this.updateMoodStmt = db.prepare("UPDATE agent_state SET mood = ? WHERE id = 1");
              }
              this.updateMoodStmt.run(JSON.stringify(decayedMood));
              this.lastMoodDbWriteTime = now;
              console.log("[CORTEX-FAST-TRACK] Mood successfully synchronized to SQLite database.");
            } else {
              console.log("[CORTEX-FAST-TRACK] Mood database write skipped (throttled to save database I/O write overhead).");
            }

            if (telemetryResult) {
              this.telemetryBuffer.push(telemetryResult);
            }

            const shouldFlushTelemetry = this.telemetryBuffer.length >= 5 || (now - this.lastTelemetryFlushTime) >= 30000;
            if (shouldFlushTelemetry && this.telemetryBuffer.length > 0) {
              if (!this.insertTelemetryStmt) {
                this.insertTelemetryStmt = db.prepare("INSERT INTO performance_metrics (timestamp, operation, latency, success, context) VALUES (?, ?, ?, ?, ?)");
              }

              const telemetryTransaction = db.transaction((records: any[]) => {
                for (const record of records) {
                  this.insertTelemetryStmt.run(
                    record.timestamp,
                    record.operation,
                    record.latency,
                    record.success,
                    record.context
                  );
                }
              });

              telemetryTransaction(this.telemetryBuffer);
              console.log(`[CORTEX-FAST-TRACK] Bulk transactions executed successfully: flushed ${this.telemetryBuffer.length} telemetries inside a single write operation.`);
              this.telemetryBuffer = [];
              this.lastTelemetryFlushTime = now;
            }
          }
        } catch (dbErr: any) {
          console.error("[CORTEX-FAST-TRACK-DB-ERROR] Failed to save non-critical background updates:", dbErr);
        }
      })();
    }

    return { decayedMood, telemetry: telemetryResult };
  }
}
