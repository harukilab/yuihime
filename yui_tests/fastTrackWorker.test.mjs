/**
 * FastTrack Worker Unit Test
 * Run: node yui_tests/fastTrackWorker.test.mjs
 */

import { Worker } from 'worker_threads';

// ─── Warna terminal ────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red:   '\x1b[31m',
  yellow:'\x1b[33m',
  cyan:  '\x1b[36m',
  bold:  '\x1b[1m',
  dim:   '\x1b[2m',
};
const ok   = (msg) => console.log(`${c.green}  ✓${c.reset} ${msg}`);
const fail = (msg) => console.log(`${c.red}  ✗${c.reset} ${msg}`);
const info = (msg) => console.log(`${c.cyan}  ➜${c.reset} ${msg}`);
const head = (msg) => console.log(`\n${c.bold}${c.cyan}${msg}${c.reset}`);

// ─── Worker code (sama persis dengan FastTrackRunner) ──────────────────────
const WORKER_CODE = `
const { parentPort } = require('worker_threads');

parentPort.on('message', (message) => {
  try {
    const { id, type, data } = message;
    if (type === 'FAST_TRACK_ALL') {
      const { mood, config, telemetry } = data;

      const now = Date.now();
      const elapsedMinutes = (now - (mood.lastUpdate || now)) / 60000;
      const decayRate = config?.decayRate || 0.5;
      const baseline  = config?.baselineMood || 10;
      const decayAmount = elapsedMinutes * decayRate;

      const lerp = (cur, base, amt) => cur + (base - cur) * amt;
      const factor     = Math.min(0.5, elapsedMinutes * 0.02);
      const fastFactor = Math.min(0.8, elapsedMinutes * 0.15);

      const decayedMood = {
        joy:          Math.max(baseline, mood.joy - (decayAmount * 0.2)),
        anger:        Math.max(0, mood.anger - decayAmount),
        stress:       Math.max(0, mood.stress - (decayAmount * 1.5)),
        excitement:   Math.max(0, mood.excitement - (decayAmount * 2.0)),
        embarrassment:Math.max(0, mood.embarrassment - (decayAmount * 3.0)),
        sadness:      Math.max(0, mood.sadness - decayAmount * 0.5),
        irritation:   Math.max(0, mood.irritation - decayAmount),
        curiosity:    Math.max(baseline, mood.curiosity - (decayAmount * 0.1)),
        loneliness:   mood.loneliness + elapsedMinutes * 0.25,
        playfulness:  lerp(mood.playfulness || 30, 30, factor),
        dopamine:     lerp(mood.dopamine || 15, 15, fastFactor),
        serotonin:    lerp(mood.serotonin || 50, 50, factor),
        oxytocin:     lerp(mood.oxytocin || 30, 30, factor),
        noradrenaline:lerp(mood.noradrenaline || 10, 10, fastFactor),
        lastUpdate: now,
      };

      let telResult = null;
      if (telemetry) {
        telResult = {
          timestamp: now,
          operation: telemetry.operation,
          latency:   telemetry.latency,
          success:   telemetry.success ? 1 : 0,
          context:   telemetry.context || null,
        };
      }

      parentPort.postMessage({ id, success: true, result: { decayedMood, telemetry: telResult } });
    } else {
      parentPort.postMessage({ id, success: false, error: 'Unknown operation type' });
    }
  } catch (err) {
    parentPort.postMessage({ id, success: false, error: err.message });
  }
});
`;

// ─── Helper: persistent dispatcher (mirip FastTrackRunner.activePromises) ───
function createDispatcher(worker) {
  const pending = new Map();

  worker.on('message', (msg) => {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.success) p.resolve(msg.result);
    else p.reject(new Error(msg.error));
  });

  return function send(id, type, data, timeoutMs = 500) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, type, data });
    });
  };
}

// ─── Fixtures ──────────────────────────────────────────────────────────────
const baseMood = {
  joy: 60, anger: 20, sadness: 10, stress: 30, irritation: 15,
  excitement: 40, embarrassment: 5, curiosity: 50,
  loneliness: 10, playfulness: 35,
  dopamine: 20, serotonin: 55, oxytocin: 35, noradrenaline: 12,
  lastUpdate: Date.now() - 10 * 60 * 1000, // 10 menit lalu
};

const baseTelemetry = {
  operation: 'test-op',
  latency: 42,
  success: true,
  context: 'unit-test',
};

// ─── Tests ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function runTests() {
  head('═══ FastTrack Worker Tests ═══');

  const worker = new Worker(WORKER_CODE, { eval: true });
  const sendToWorker = createDispatcher(worker);

  // ── Test 1: Basic mood decay ─────────────────────────────────────────────
  head('1. Mood Decay');
  try {
    const result = await sendToWorker('test-1', 'FAST_TRACK_ALL', {
      mood: baseMood,
      config: { decayRate: 0.5, baselineMood: 10 },
    });

    const dm = result.decayedMood;
    if (typeof dm !== 'object' || !dm) throw new Error('decayedMood bukan object');

    // Joy tidak boleh turun di bawah baseline
    if (dm.joy >= 10) ok(`joy decayed correctly: ${dm.joy.toFixed(2)}`);
    else              { fail(`joy below baseline: ${dm.joy.toFixed(2)}`); failed++; }

    // Anger harus turun (mood sudah 10 menit lalu)
    if (dm.anger < baseMood.anger) ok(`anger decayed: ${baseMood.anger} → ${dm.anger.toFixed(2)}`);
    else                            { fail(`anger did not decay: ${dm.anger.toFixed(2)}`); failed++; }

    // lastUpdate harus lebih baru
    if (dm.lastUpdate > baseMood.lastUpdate) ok(`lastUpdate refreshed: ${dm.lastUpdate}`);
    else                                      { fail('lastUpdate not updated'); failed++; }

    // Telemetry harus null kalau tidak dikirim
    if (result.telemetry === null) ok('telemetry null when not provided');
    else                           { fail(`expected telemetry null, got: ${JSON.stringify(result.telemetry)}`); failed++; }

    passed += 4;
  } catch (e) {
    fail(`Test 1 exception: ${e.message}`); failed++;
  }

  // ── Test 2: Telemetry formatting ─────────────────────────────────────────
  head('2. Telemetry Formatting');
  try {
    const result = await sendToWorker('test-2', 'FAST_TRACK_ALL', {
      mood: baseMood,
      config: {},
      telemetry: baseTelemetry,
    });

    const tel = result.telemetry;
    if (!tel)                          { fail('telemetry is null'); failed++; }
    else {
      if (tel.operation === 'test-op') ok(`operation: ${tel.operation}`);
      else                              { fail(`expected operation "test-op", got "${tel.operation}"`); failed++; }

      if (tel.latency === 42)          ok(`latency: ${tel.latency}ms`);
      else                              { fail(`expected latency 42, got ${tel.latency}`); failed++; }

      if (tel.success === 1)           ok(`success serialized as 1`);
      else                              { fail(`expected success=1, got ${tel.success}`); failed++; }

      if (tel.context === 'unit-test') ok(`context: ${tel.context}`);
      else                              { fail(`expected context "unit-test", got "${tel.context}"`); failed++; }

      if (typeof tel.timestamp === 'number') ok(`timestamp present: ${tel.timestamp}`);
      else                                    { fail('timestamp missing or not number'); failed++; }

      passed += 5;
    }
  } catch (e) {
    fail(`Test 2 exception: ${e.message}`); failed++;
  }

  // ── Test 3: Telemetry success=false → serializes as 0 ───────────────────
  head('3. Telemetry success=false');
  try {
    const result = await sendToWorker('test-3', 'FAST_TRACK_ALL', {
      mood: baseMood,
      config: {},
      telemetry: { ...baseTelemetry, success: false },
    });
    const tel = result.telemetry;
    if (tel && tel.success === 0) { ok('success=false serialized as 0'); passed++; }
    else                          { fail(`expected 0, got ${tel?.success}`); failed++; }
  } catch (e) {
    fail(`Test 3 exception: ${e.message}`); failed++;
  }

  // ── Test 4: Unknown operation type → graceful error response ─────────────
  head('4. Unknown operation type');
  try {
    await sendToWorker('test-4', 'UNKNOWN_OP', {});
    fail('Expected rejection but resolved'); failed++;
  } catch (e) {
    if (e.message === 'Unknown operation type') {
      ok(`Unknown op rejected cleanly: "${e.message}"`); passed++;
    } else {
      fail(`Unexpected error: ${e.message}`); failed++;
    }
  }

  // ── Test 5: High-frequency burst (10 rapid requests) ────────────────────
  head('5. Burst mode (10 rapid requests)');
  try {
    const promises = Array.from({ length: 10 }, (_, i) =>
      sendToWorker(`burst-${i}`, 'FAST_TRACK_ALL', {
        mood: { ...baseMood, lastUpdate: Date.now() },
        config: {},
        telemetry: { operation: `burst-${i}`, latency: i * 5, success: true },
      }, 2000)
    );
    const results = await Promise.all(promises);
    const allOk = results.every(r => r?.decayedMood && r?.telemetry);
    if (allOk) { ok(`All 10 burst requests resolved successfully`); passed++; }
    else        { fail(`Some burst requests failed`); failed++; }
  } catch (e) {
    fail(`Test 5 exception: ${e.message}`); failed++;
  }

  // ── Test 6: Fresh mood (lastUpdate = now) → minimal decay ────────────────
  head('6. Fresh mood — minimal decay');
  try {
    const freshMood = { ...baseMood, lastUpdate: Date.now() };
    const result = await sendToWorker('test-6', 'FAST_TRACK_ALL', {
      mood: freshMood,
      config: { decayRate: 0.5, baselineMood: 10 },
    });
    const dm = result.decayedMood;
    const joyDiff = Math.abs(dm.joy - freshMood.joy);
    if (joyDiff < 1.0) { ok(`Joy barely changed (diff=${joyDiff.toFixed(4)}) — decay is time-based`); passed++; }
    else                { fail(`Joy changed too much for fresh mood: diff=${joyDiff.toFixed(4)}`); failed++; }
  } catch (e) {
    fail(`Test 6 exception: ${e.message}`); failed++;
  }

  // ── Selesai ───────────────────────────────────────────────────────────────
  await worker.terminate();

  const total = passed + failed;
  head('═══ Results ═══');
  console.log(`  ${c.bold}Passed:${c.reset} ${c.green}${passed}${c.reset} / ${total}`);
  if (failed > 0) {
    console.log(`  ${c.bold}Failed:${c.reset} ${c.red}${failed}${c.reset} / ${total}`);
    process.exit(1);
  } else {
    console.log(`\n  ${c.green}${c.bold}All tests passed!${c.reset}`);
  }
}

runTests().catch((e) => {
  console.error(`${c.red}Fatal:${c.reset}`, e);
  process.exit(1);
});
