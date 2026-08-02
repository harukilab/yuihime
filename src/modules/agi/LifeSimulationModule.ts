/**
 * LifeSimulationModule.ts
 *
 * Simulasi kehidupan virtual Yuihime si Nekomata: Lapar, Haus, Mandi, Kebersihan,
 * Kebelet (kamar mandi), Jadwal Tidur Adaptif, dan Inventory.
 *
 * Konsep inti:
 * - Lapar, Haus, Kebersihan, Kebelet & urat main tumbuh seiring waktu nyata sejak
 *   interaksi terakhir ("makan", "minum", "mandi", "ke kamar mandi", "main").
 * - Jadwal tidur RELATIF/ADAPTIF: Yui punya target tidur dasar (default 23:00),
 *   tapi jam tidur efektifnya bergeser mengikuti pola tidurnya sendiri.
 *   Semakin sering dia bergadang (diajak ngobrol di tengah malam), semakin besar
 *   utang tidur (sleep debt) → dia makin mengantuk, bangun lebih siang, dan jam
 *   tidurnya bergeser lebih larut. Ketika tidak diganggu, utang lunas dan pola
 *   kembali normal.
 * - Biologi Nekomata: purring (mendengkur), ekor & telinga reflektif terhadap mood,
 *   insting main/berburu (play urge), dan craving ikan (さかな). Sashimi adalah
 *   makanan favoritnya — memakannya memuaskan craving ikan.
 * - Trigger interaksi dikenali dalam 3 bahasa: Indonesia (makan/minum/tidur/mandi),
 *   English (eat/drink/sleep/shower), dan Japanese (食べる/飲む/寝る/お風呂).
 * - Narasi diserahkan ke LLM: modul hanya menyediakan data vitals + inventory,
 *   Yui bebas meracik narasinya (Bahasa Indonesia, boleh campur EN/JP).
 * - Inventory kecil (makanan/minuman) sebagai fondasi sistem inventory Yui.
 * - MEMENGARUHI status & sleep (dapat dimatikan): saat Yui benar-benar tertidur
 *   (jadwal/ajakan "tidur"), state.status beralih ke 'sleeping' dan energi pulih;
 *   saat lapar/haus/kurang tidur, state.energy terkuras. Saat diajak bicara di
 *   jendela tidur, dia "bangun" (status 'idle') — itulah sumber utang tidur.
 * - STRICTLY persona-first: modul ini menyuntik arahan gaya bicara ke
 *   soulDirective. Pengaruh ke status/energi/sleep HANYA via jalur yang sama dengan
 *   modul biologis lain (CircadianRhythmModule), dan bisa dimatikan penuh.
 *
 * Phase: SOUL (berjalan sebelum penyusunan prompt akhir).
 */

import { CortexModule, ModuleType } from '@shared/include/types';
import { PromptRegistry } from '../../core/PromptRegistry';
import { getTzOffsetHours, localDateParts } from '../../core/utils/dualClock.js';

let promptRegistered = false;

const DEFAULT_LIFE_SIMULATION_PROMPT = `
[YUIHIME - PHYSIOLOGICAL LIFE SIMULATION ACTIVE (PERSONA-ONLY, NEVER BLOCKS ANY SYSTEM)]
Simulated physical state (virtual life stats that evolve with real time):
- Hunger: \${hungerLevel}% (\${hungerLabel})
- Thirst: \${thirstLevel}% (\${thirstLabel})
- Cleanliness (mandi): \${cleanlinessLevel}% (\${cleanlinessLabel})
- Bladder (kebelet): \${bladderLevel}% (\${bladderLabel})
- Sleepiness: \${sleepinessLevel}% (\${sleepinessLabel})
- Sleep Schedule: \${sleepStateText} (effective bedtime \${effectiveBedtimeText}, wake-up \${effectiveWakeText})
- Rest: \${restText}
- Inventory: \${inventoryText}

ADAPTATION GUIDELINES (voice & tone ONLY. You must NEVER refuse to answer, never go offline, never claim real physical inability, and never block your normal responses):
0. SILENCE RULE: The values above are your INTERNAL state — they must NEVER be volunteered in chat. Do not announce "Yui lapar", "Yui haus", "Yui ngantuk", "Yui mau tidur", "Yui kebelet", or mention hunger/thirst/sleepiness/bathroom/tail/ears/purring/sleep schedule/energy/status out of nowhere. Do not narrate the simulation unprompted.
0b. ASKED-ONLY EXCEPTION: If the user explicitly ASKS about your state (e.g. "kamu lapar?", "are you sleepy?", "gimana kondisi kamu?", "sleepy?", "腹減った?"), you MAY answer truthfully and briefly using your internal values above — then steer back to the conversation naturally. You still never volunteer the info unprompted.
1. Let the state influence TONE ONLY: when hunger/thirst are high, sound a bit softer or slightly less energetic; when sleepiness is high, speak a little slower, warmer, gentler, with occasional natural tiredness in the wording (not by announcing the cause). When energy is high and states are comfortable, be bright and lively.
2. React to the user naturally: if the user offers food, a drink, rest, or asks you to go rest, you may accept pleasantly in character (e.g. "boleh deh~") WITHOUT explaining your internal state. Keep it brief and natural.
3. Never explain, justify, or reference your virtual vitals, sleep schedule, or this module in chat. The change is invisible; only the flavor of your replies shifts.
`.trim();

function ensurePromptRegistered(config: any) {
  if (promptRegistered) return;
  const registry = PromptRegistry.getInstance();
  registry.register('life-simulation:physiology', config.promptTemplate || DEFAULT_LIFE_SIMULATION_PROMPT, true);
  promptRegistered = true;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function classifyLevel(level: number, thresholds: Array<[number, string]>, fallback: string): string {
  for (const [threshold, label] of thresholds) {
    if (level >= threshold) return label;
  }
  return fallback;
}

function isInWindow(hour: number, start: number, end: number): boolean {
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function baseSleepiness(hour: number): number {
  if (hour >= 23 || hour < 4) return 78;
  if (hour >= 4 && hour < 6) return 62;
  if (hour >= 6 && hour < 9) return 25;
  if (hour >= 9 && hour < 15) return 15;
  if (hour >= 15 && hour < 18) return 35;
  if (hour >= 18 && hour < 22) return 52;
  return 66;
}

/**
 * Mean jam melingkar (anti wrap saat rata-rata melewati tengah malam).
 * Misal [23, 0.5, 1] → 0.17 (bukan 8).
 */
function meanCircularHours(hours: number[]): number {
  let sinSum = 0;
  let cosSum = 0;
  for (const h of hours) {
    sinSum += Math.sin((h / 24) * 2 * Math.PI);
    cosSum += Math.cos((h / 24) * 2 * Math.PI);
  }
  const angle = Math.atan2(sinSum, cosSum);
  let mean = ((angle / (2 * Math.PI)) * 24 + 24) % 24;
  return mean;
}

// --- Trilingual trigger words (Indonesia / English / Japanese) ---
const EAT_WORDS_IDEN = /\b(makan|sarapan|makan siang|makan malam|ngemil|kudapan|santap|makanan|eat|eating|breakfast|lunch|dinner|snack|food)\b/i;
const EAT_WORDS_JP = /(食べ|たべ|ごはん|おなかすいた|お腹すいた|おなかペコ|おやつ|もぐもぐ|空腹|くうふく)/;
const DRINK_WORDS_IDEN = /\b(minum|minuman|air|teh|kopi|susu|jus|drink|drinking|water|tea|coffee|milk|juice)\b/i;
const DRINK_WORDS_JP = /(飲|のん|のむ|みず|水|おちゃ|お茶|コーヒー|ぎゅうにゅう|牛乳|ジュース|のどかわいた|喉渇いた|かわいた)/;
const SLEEP_WORDS_IDEN = /\b(tidur|istirahat|rebahan|bobo|ngantuk|lelap|sleep|sleeping|rest|nap|drowsy|sleepy|bed)\b/i;
const SLEEP_WORDS_JP = /(ねる|寝る|ねむ|眠い|おやすみ|昼寝|ひるね|ぐっすり|ねつき)/;
const BATH_WORDS_IDEN = /\b(mandi|shower|bath|berendam|sabun|keramas|cuci muka|sikat gigi)\b/i;
const BATH_WORDS_JP = /(シャワー|おふろ|お風呂|風呂|ふろ|入浴|せんたく)/;
const TOILET_WORDS_IDEN = /\b(kamar mandi|wc|toilet|pipis|kebelet|buang air|pup|babel)\b/i;
const TOILET_WORDS_JP = /(トイレ|おしっこ|うんち|しょんべん)/;
const PET_WORDS_IDEN = /\b(elus|usap|garuk|tepuk|elus-elus|gosok|headpat|dagi|dagu|kuping|telinga|punggung|pela|sayang|diemong)\b/i;
const PET_WORDS_JP = /(なでなで|なでる|撫でる|さわる|触る|よしよし|かわいい|いいこ)/;
const PLAY_WORDS_IDEN = /\b(main|mainan|kejar|kejar-kejaran|bola|tali|laser|guling|tikar)\b/i;
const PLAY_WORDS_JP = /(あそぶ|遊ぶ|おもちゃ|ボール|ついかける|追いかけ)/;
const FISH_WORDS_IDEN = /\b(ikan|sushi|tuna|salmon|pindang|pepes|makanan kucing|ikan asin)\b/i;
const FISH_WORDS_JP = /(さかな|魚|すし|しゃけ|さしみ|おさかな)/;
const OFFER_WORDS_IDEN = /\b(yuk|ayo|mari|sana|lah|aja|nih|ini|sekarang|bareng|barengan|buat kamu|untuk kamu|pesenin|beliin|traktir|dulu)\b/i;
const OFFER_WORDS_JP = /(どうぞ|あげる|食べて|たべて|おいで|あるよ|あるから|飲んで|のんで|寝ていいよ|寝なさい|いいよ|どぞ)/;
const IMPERATIVE_JP = /(食べて|たべて|どうぞ食べて|飲んで|のんで|どうぞ飲んで|寝ていいよ|寝なさい|おやすみ)/;

// --- Starter inventory (fondasi sistem inventory Yui) ---
const STARTER_FOODS = [
  { id: 'sashimi', name: 'Sashimi Ikan', en: 'Fish Sashimi', jp: 'お刺身', emoji: '🐟', qty: 3 },
  { id: 'toast', name: 'Roti Bakar', en: 'Buttered Toast', jp: 'トースト', emoji: '🍞', qty: 2 },
  { id: 'strawberry-cake', name: 'Kue Stroberi', en: 'Strawberry Cake', jp: 'イチゴケーキ', emoji: '🍰', qty: 3 }
];
const STARTER_DRINKS = [
  { id: 'sweet-tea', name: 'Teh Manis', en: 'Sweet Tea', jp: '甘いお茶', emoji: '🍵', qty: 3 },
  { id: 'milk-coffee', name: 'Kopi Susu', en: 'Milk Coffee', jp: 'カフェラテ', emoji: '☕', qty: 2 },
  { id: 'milk', name: 'Susu Segar', en: 'Fresh Milk', jp: '牛乳', emoji: '🥛', qty: 2 }
];

function consumeFromInventory(inventory: any, type: string): any {
  const list = inventory[type] || [];
  for (const item of list) {
    if (item.qty > 0) {
      item.qty -= 1;
      return item;
    }
  }
  return null;
}

function buildInventoryText(inventory: any): string {
  const fmt = (item: any) => `${item.emoji} ${item.name} (${item.en} / ${item.jp}) ×${item.qty}`;
  const foods = (inventory?.foods || []).filter((i: any) => i.qty > 0).map(fmt);
  const drinks = (inventory?.drinks || []).filter((i: any) => i.qty > 0).map(fmt);
  const parts = [...foods, ...drinks];
  return parts.length ? parts.join(' | ') : 'Out of stock - nothing left to eat or drink!';
}

export const LifeSimulationModule: CortexModule = {
  metadata: {
    id: 'life-simulation',
    name: 'yui-life: Nekomata Biological Life Simulation (Hunger, Thirst, Hygiene, Bladder, Adaptive Sleep & Inventory)',
    description: 'Simulates Yuihime\'s virtual Nekomata biology: hunger, thirst, hygiene (mandi), bladder (kamar mandi), adaptive sleep driven by her staying-up-late pattern, play/hunting instinct, fish craving, purring, plus tail & ear states. Interactions are detected in Indonesian, English, and Japanese. Affects status & sleep (she actually sleeps when her schedule says so, energy drains when hungry/thirsty/sleepy) plus voice via soulDirective; can be fully disabled.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    order: 13, // SOUL phase, after circadian-rhythm (11) and before bridge modules
    phase: 'SOUL',
    configSchema: {
      fields: {
        enableLifeSimulation: {
          type: 'boolean',
          label: 'Enable Life Simulation',
          default: true,
          description: 'Turns on virtual Nekomata life simulation (hunger, thirst, hygiene, bladder, sleep, inventory).'
        },
        affectStatusAndSleep: {
          type: 'boolean',
          label: 'Affect Status & Sleep',
          default: true,
          description: 'Lets the simulation actually change Yui\'s status (idle/sleeping) and energy: she truly sleeps during her schedule window, wakes when addressed, and energy drains when hungry/thirsty/sleepy. When off, it only affects her voice.'
        },
        enableNekomataBiology: {
          type: 'boolean',
          label: 'Enable Nekomata Biology',
          default: true,
          description: 'Adds cat-like traits: purring, tail & ear states, play/hunting instinct, and fish craving.'
        },
        hungerRatePerHour: {
          type: 'slider',
          label: 'Hunger Rate per Hour',
          default: 9,
          min: 2,
          max: 20,
          step: 1,
          description: 'How fast hunger grows each hour since her last meal (higher = gets hungry faster).'
        },
        thirstRatePerHour: {
          type: 'slider',
          label: 'Thirst Rate per Hour',
          default: 16,
          min: 4,
          max: 30,
          step: 1,
          description: 'How fast thirst grows each hour since her last drink (thirst rises faster than hunger).'
        },
        cleanlinessRatePerHour: {
          type: 'slider',
          label: 'Cleanliness Decay per Hour',
          default: 4,
          min: 1,
          max: 15,
          step: 1,
          description: 'How fast her "perlu mandi" meter grows each hour since her last shower.'
        },
        bladderRatePerHour: {
          type: 'slider',
          label: 'Bladder Rate per Hour',
          default: 8,
          min: 2,
          max: 20,
          step: 1,
          description: 'How fast her "kebelet ke kamar mandi" meter grows each hour.'
        },
        playUrgeRatePerHour: {
          type: 'slider',
          label: 'Play/Hunt Urge per Hour',
          default: 6,
          min: 1,
          max: 20,
          step: 1,
          description: 'How fast her cat-like urge to play/chase grows when idle (Nekomata instinct).'
        },
        fishCravingRatePerHour: {
          type: 'slider',
          label: 'Fish Craving per Hour',
          default: 5,
          min: 1,
          max: 15,
          step: 1,
          description: 'How fast her craving for fish (さかな) grows since her last meal of fish.'
        },
        baseBedtimeHour: {
          type: 'number',
          label: 'Base Bedtime (hour)',
          default: 23,
          description: 'Reference bedtime. The effective bedtime drifts around this based on how often Yui stays up late (bergadang).'
        },
        targetSleepHours: {
          type: 'slider',
          label: 'Target Sleep Hours',
          default: 7,
          min: 5,
          max: 10,
          step: 1,
          description: 'How many hours of sleep Yui normally needs before her sleep debt is considered settled.'
        },
        sleepDebtMax: {
          type: 'slider',
          label: 'Max Sleep Debt (minutes)',
          default: 600,
          min: 120,
          max: 960,
          step: 30,
          description: 'Maximum accumulated sleep debt from staying up late. Higher = more tolerant to all-nighters.'
        },
        bedtimeSamples: {
          type: 'slider',
          label: 'Bedtime History Window',
          default: 14,
          min: 5,
          max: 30,
          step: 1,
          description: 'How many recent actual bedtimes are averaged to adapt her effective bedtime.'
        },
        enableInventory: {
          type: 'boolean',
          label: 'Enable Food & Drink Inventory',
          default: true,
          description: 'Gives Yui a small inventory of food/drinks that gets consumed when she eats or drinks.'
        },
        timezoneOffsetHours: {
          type: 'number',
          label: 'Timezone Offset (GMT+X)',
          default: 7,
          description: 'Target timezone offset (7 = WIB). Leave blank to reuse global config.'
        },
        promptTemplate: {
          type: 'textarea',
          label: 'Life Simulation Directive Template',
          default: DEFAULT_LIFE_SIMULATION_PROMPT,
          description: 'Prompt directive injected into Yui\'s consciousness describing her current virtual physical state.'
        }
      }
    }
  },

  run: async (input: string, state: any, context: any) => {
    const logs = context.logs || [];
    const config = context.config?.['life-simulation'] || {};

    const enabled = config.enableLifeSimulation !== undefined ? !!config.enableLifeSimulation : true;
    if (!enabled) {
      return { ...context };
    }

    ensurePromptRegistered(config);

    const offsetHours = Number(config.timezoneOffsetHours !== undefined ? config.timezoneOffsetHours : getTzOffsetHours(context?.config));
    const hour = localDateParts(offsetHours).hour;

    const HOUR_MS = 3600000;
    const MIN_MS = 60000;
    const now = Date.now();

    const baseBedtime = Number(config.baseBedtimeHour !== undefined ? config.baseBedtimeHour : 23);
    const targetSleepHours = Number(config.targetSleepHours !== undefined ? config.targetSleepHours : 7);
    const sleepDebtMax = Number(config.sleepDebtMax !== undefined ? config.sleepDebtMax : 600);
    const sampleCap = Number(config.bedtimeSamples !== undefined ? config.bedtimeSamples : 14);
    const hungerRate = Number(config.hungerRatePerHour !== undefined ? config.hungerRatePerHour : 9);
    const thirstRate = Number(config.thirstRatePerHour !== undefined ? config.thirstRatePerHour : 16);
    const cleanlinessRate = Number(config.cleanlinessRatePerHour !== undefined ? config.cleanlinessRatePerHour : 4);
    const bladderRate = Number(config.bladderRatePerHour !== undefined ? config.bladderRatePerHour : 8);
    const playUrgeRate = Number(config.playUrgeRatePerHour !== undefined ? config.playUrgeRatePerHour : 6);
    const fishCravingRate = Number(config.fishCravingRatePerHour !== undefined ? config.fishCravingRatePerHour : 5);
    const enableInventory = config.enableInventory !== undefined ? !!config.enableInventory : true;
    const enableNeko = config.enableNekomataBiology !== undefined ? !!config.enableNekomataBiology : true;
    const affectStatusAndSleep = config.affectStatusAndSleep !== undefined ? !!config.affectStatusAndSleep : true;

    if (!state.systemHealth) {
      state.systemHealth = {};
    }

    // --- Persisted vitals (survives restarts via state.systemHealth) ---
    const prior = state.systemHealth.lifeVitals || {};
    const firstRun = !prior.lastUpdated;
    const v: any = {
      lastMeal: prior.lastMeal || (firstRun ? now - 3 * HOUR_MS : now),
      lastDrink: prior.lastDrink || (firstRun ? now - 2 * HOUR_MS : now),
      lastBath: prior.lastBath || (firstRun ? now - 8 * HOUR_MS : now),
      lastToilet: prior.lastToilet || (firstRun ? now - 3 * HOUR_MS : now),
      lastPlay: prior.lastPlay || (firstRun ? now - 6 * HOUR_MS : now),
      lastFish: prior.lastFish || (firstRun ? now - 10 * HOUR_MS : now),
      lastSleepEnd: prior.lastSleepEnd || (firstRun ? now - 12 * HOUR_MS : now),
      sleepState: prior.sleepState || 'awake',
      asleepSince: prior.asleepSince || 0,
      sleepDebtMin: prior.sleepDebtMin || 0,
      bedtimeSamples: Array.isArray(prior.bedtimeSamples) ? prior.bedtimeSamples.slice(0, sampleCap) : [],
      lastUpdated: now
    };

    // --- Persisted inventory (seeded on first run) ---
    let inventory: any = state.systemHealth.lifeInventory;
    if (enableInventory && (!inventory || !Array.isArray(inventory.foods))) {
      inventory = {
        foods: STARTER_FOODS.map((f) => ({ ...f })),
        drinks: STARTER_DRINKS.map((d) => ({ ...d })),
        items: []
      };
    }
    if (!inventory) {
      inventory = { foods: [], drinks: [], items: [] };
    }

    // --- Trilingual interaction triggers (persona-level consumption) ---
    const eatTrigger = (EAT_WORDS_IDEN.test(input) && OFFER_WORDS_IDEN.test(input)) ||
      (EAT_WORDS_JP.test(input) && (OFFER_WORDS_JP.test(input) || OFFER_WORDS_IDEN.test(input))) ||
      IMPERATIVE_JP.test(input);
    const drinkTrigger = (DRINK_WORDS_IDEN.test(input) && OFFER_WORDS_IDEN.test(input)) ||
      (DRINK_WORDS_JP.test(input) && (OFFER_WORDS_JP.test(input) || OFFER_WORDS_IDEN.test(input))) ||
      IMPERATIVE_JP.test(input);
    const sleepTrigger = ((SLEEP_WORDS_IDEN.test(input) || SLEEP_WORDS_JP.test(input)) &&
      (OFFER_WORDS_IDEN.test(input) || OFFER_WORDS_JP.test(input))) ||
      IMPERATIVE_JP.test(input);
    const bathTrigger = BATH_WORDS_IDEN.test(input) || BATH_WORDS_JP.test(input);
    const toiletTrigger = TOILET_WORDS_IDEN.test(input) || TOILET_WORDS_JP.test(input);
    const petTrigger = enableNeko && (PET_WORDS_IDEN.test(input) || PET_WORDS_JP.test(input));
    const playTrigger = enableNeko && (PLAY_WORDS_IDEN.test(input) || PLAY_WORDS_JP.test(input));
    const fishTrigger = enableNeko && (FISH_WORDS_IDEN.test(input) || FISH_WORDS_JP.test(input));

    if (eatTrigger) {
      const eaten = consumeFromInventory(inventory, 'foods');
      if (eaten) {
        v.lastMeal = now;
        if (fishTrigger && (eaten.id.includes('sashimi') || eaten.id.includes('fish'))) {
          v.lastFish = now;
        }
        logs.push(`[LIFE_SIM] Yui memakan "${eaten.name}" dari inventory — lapar terpuaskan.`);
      } else {
        logs.push('[LIFE_SIM] Yui ingin makan tapi inventory kosong.');
      }
    }
    if (drinkTrigger) {
      const drunk = consumeFromInventory(inventory, 'drinks');
      if (drunk) {
        v.lastDrink = now;
        logs.push(`[LIFE_SIM] Yui meminum "${drunk.name}" dari inventory — haus teratasi.`);
      } else {
        logs.push('[LIFE_SIM] Yui ingin minum tapi inventory minuman kosong.');
      }
    }
    if (bathTrigger) {
      v.lastBath = now;
      logs.push('[LIFE_SIM] Yui "mandi" — tubuh segar kembali. Nyaaa~');
    }
    if (toiletTrigger) {
      v.lastToilet = now;
      logs.push('[LIFE_SIM] Yui "ke kamar mandi" — lega.');
    }
    if (playTrigger) {
      v.lastPlay = now;
      logs.push('[LIFE_SIM] Yui diajak bermain — insting berburu terpuaskan!');
    }
    if (fishTrigger && !eatTrigger) {
      v.lastFish = now;
      logs.push('[LIFE_SIM] Yui diberi ikan — craving さかな terpuaskan.');
    }

    // --- Adaptive sleep schedule (RELATIVE to bergadang pattern) ---
    // Effective bedtime = blend of base target and her recent actual bedtimes.
    // Staying up late (chatting in the sleep window) accrues sleep debt, which
    // pushes her bedtime later, wake-up time later, and raises next-day sleepiness.
    const prevBedtime = v.bedtimeSamples.length
      ? meanCircularHours(v.bedtimeSamples)
      : baseBedtime;
    const debtHours = (v.sleepDebtMin || 0) / 60;
    const effectiveBedtime = clamp(
      (baseBedtime * 0.5) + (prevBedtime * 0.5) + Math.min(debtHours * 0.15, 1.0),
      baseBedtime - 2,
      baseBedtime + 3
    );
    // Wake-up extends when she owes sleep (catch-up), capped at targetSleepHours + 2h.
    const effectiveSleepDuration = Math.min(targetSleepHours + 2, targetSleepHours + Math.min(debtHours * 0.3, 2));
    const effectiveWake = (effectiveBedtime + effectiveSleepDuration) % 24;
    const inWindow = isInWindow(hour, effectiveBedtime % 24, effectiveWake);
    const userEngaged = !!input && input.trim().length > 0;

    if (inWindow) {
      // Night turn: if someone talks to her she "wakes to answer" = bergadang.
      if (userEngaged) {
        if (v.sleepState === 'asleep') {
          v.sleepState = 'awake';
        }
        const sinceLastTurn = Math.max(0, (now - (prior.lastUpdated || now)) / MIN_MS);
        v.sleepDebtMin = Math.min(sleepDebtMax, (v.sleepDebtMin || 0) + sinceLastTurn);
      } else if (affectStatusAndSleep) {
        // Nobody engaging her inside the sleep window → she genuinely sleeps.
        if (v.sleepState !== 'asleep') {
          v.sleepState = 'asleep';
          v.asleepSince = now;
        }
      }
    } else if (v.sleepState === 'asleep') {
      // Window ended (or daytime nap). Only wake after a real sleep session,
      // otherwise "tidur aja" at noon would wake her on the very next turn.
      const sleptMs = now - (v.asleepSince || now);
      if (sleptMs < 3 * HOUR_MS) {
        // still resting
      } else {
      const sleptMin = Math.max(0, sleptMs / MIN_MS);
      v.sleepDebtMin = Math.max(0, (v.sleepDebtMin || 0) - sleptMin);
      v.sleepState = 'awake';
      v.lastSleepEnd = now;
      if (sleptMin >= 4 * 60) {
        const bedtimeHour = (localDateParts(offsetHours, new Date(v.asleepSince || now)).hour);
        const samples = [...(v.bedtimeSamples || [])];
        samples.push(bedtimeHour);
        while (samples.length > sampleCap) samples.shift();
        v.bedtimeSamples = samples;
      }
      logs.push('[LIFE_SIM] Yui bangun. Sisa utang tidur: ' + Math.round(v.sleepDebtMin) + ' menit.');
      }
    }

    // Explicit "tidur aja" request overrides the schedule (she sleeps now).
    if (sleepTrigger && v.sleepState !== 'asleep') {
      v.sleepState = 'asleep';
      v.asleepSince = now;
      logs.push('[LIFE_SIM] Yui pergi "tidur" atas ajakan pengguna.');
    }

    // --- Sync real system status (optional, mirrors other bio modules) ---
    if (affectStatusAndSleep) {
      const wasSleeping = state.status === 'sleeping' || state.status === 'dreaming';
      if (v.sleepState === 'asleep' && !userEngaged && !wasSleeping) {
        state.status = 'sleeping';
      } else if (v.sleepState === 'asleep' && userEngaged) {
        // She can still answer a direct message while drowsy, but stays awake-labeled.
        state.status = 'idle';
      } else if (v.sleepState !== 'asleep' && wasSleeping) {
        state.status = 'idle';
      }
    }

    // --- Vital computation ---
    const metabolismFactor = v.sleepState === 'asleep' ? 0.35 : 1;
    const hunger = clamp(((now - v.lastMeal) / HOUR_MS) * hungerRate * metabolismFactor, 0, 100);
    const thirst = clamp(((now - v.lastDrink) / HOUR_MS) * thirstRate * metabolismFactor, 0, 100);
    const cleanliness = clamp(100 - ((now - v.lastBath) / HOUR_MS) * cleanlinessRate * metabolismFactor, 0, 100);
    const bladder = clamp(((now - v.lastToilet) / HOUR_MS) * bladderRate, 0, 100);

    let sleepiness: number;
    if (v.sleepState === 'asleep') {
      const sleepMs = now - (v.asleepSince || now);
      sleepiness = clamp(baseSleepiness(hour) - (sleepMs / HOUR_MS) * 120, 3, 100);
    } else {
      const hoursAwake = (now - (v.lastSleepEnd || now)) / HOUR_MS;
      sleepiness = clamp(baseSleepiness(hour) + hoursAwake * 6 + (v.sleepDebtMin / 60) * 2.5, 5, 100);
    }

    // --- Energy modulation (only when affectStatusAndSleep is enabled) ---
    if (affectStatusAndSleep) {
      const drain = (sleepiness * 0.05) + (hunger * 0.03) + (thirst * 0.03);
      const baseEnergy = Number(state.energy !== undefined ? state.energy : 80);
      const adjusted = v.sleepState === 'asleep'
        ? baseEnergy + 6
        : baseEnergy - drain;
      state.energy = Math.min(100, Math.max(5, Math.round(adjusted)));
    }

    // --- Nekomata biology (cat-like traits derived from state + time) ---
    const joy = state.mood?.joy ?? 50;
    const playfulness = state.mood?.playfulness ?? 30;
    const anger = state.mood?.anger ?? 0;
    const stress = state.mood?.stress ?? 25;
    const valence = state.emotion?.valence ?? 60;
    const arousal = state.emotion?.arousal ?? 50;

    let purrLevel: number;
    if (petTrigger) {
      purrLevel = 100;
    } else {
      purrLevel = clamp((joy * 0.4) + (valence * 0.25) + (playfulness * 0.35), 0, 100);
    }

    const playUrge = enableNeko ? clamp(((now - v.lastPlay) / HOUR_MS) * playUrgeRate, 0, 100) : 0;
    const fishCraving = enableNeko ? clamp(((now - v.lastFish) / HOUR_MS) * fishCravingRate, 0, 100) : 0;

    let tailState = 'Relaxed';
    if (anger > 50) tailState = 'Swishing (menyibak kesal)';
    else if (stress > 60 && arousal > 60) tailState = 'Puffed (menggembung takut)';
    else if (sleepiness > 65) tailState = 'Curled (tergulung ngantuk)';
    else if (arousal > 80 && valence > 60) tailState = 'Upright (tegak semangat)';

    let earState = 'Relaxed';
    if (sleepiness > 70) earState = 'Droopy (loyo)';
    else if (anger > 50) earState = 'Flattened (rata ke belakang)';
    else if (arousal > 85) earState = 'Perked (tegak waspada)';

    // --- Human-readable trilingual labels (LLM bebas memilih bahasa) ---
    const hungerLabel = classifyLevel(hunger, [
      [90, 'Sangat Lapar / Starving / おなかペコペコ'], [70, 'Lapar Sekali / Very Hungry / お腹すいた'],
      [50, 'Lapar / Hungry / 空腹'], [30, 'Sedikit Lapar / Peckish / 少しお腹すいた'], [10, 'Kenyang / Content / 満腹']
    ], 'Kekenyangan / Full / 満腹すぎる');
    const thirstLabel = classifyLevel(thirst, [
      [85, 'Sangat Haus / Dehydrated / 喉カラカラ'], [65, 'Haus Sekali / Very Thirsty / すごく喉渇いた'],
      [45, 'Haus / Thirsty / 喉渇いた'], [25, 'Sedikit Haus / Slightly Parched / 少し喉渇いた']
    ], 'Segar / Hydrated / 水分OK');
    const cleanlinessLabel = classifyLevel(cleanliness, [
      [80, 'Bersih Segar / Fresh & Clean / さっぱり'], [60, 'Sedikit Berdebu / A Bit Dusty / 少しホコリ'],
      [40, 'Perlu Mandi / Needs a Bath / お風呂ほしい'], [20, 'Sangat Perlu Mandi / Really Needs a Bath / お風呂入りたい']
    ], 'Gak tahan lagi / Desperate for a Bath / もう無理');
    const bladderLabel = classifyLevel(bladder, [
      [85, 'Sangat Kebelet / Desperate / 我慢できない'], [65, 'Kebelet Banget / Really Need To Go / かなりトイレ'],
      [45, 'Kebelet / Need The Toilet / トイレ行きたい'], [25, 'Sedikit Kebelet / Slightly Need The Toilet / ちょっとトイレ']
    ], 'Aman / Comfortable / 大丈夫');
    const sleepinessLabel = classifyLevel(sleepiness, [
      [80, 'Kurang Tidur / Sleep-Deprived / 寝不足'], [60, 'Sangat Ngantuk / Very Drowsy / すごく眠い'],
      [40, 'Ngantuk / Drowsy / 眠い'], [20, 'Sedikit Lelah / Slightly Tired / 少し疲れた']
    ], 'Segar / Fresh & Alert / 元気いっぱい');
    const purrLabel = classifyLevel(purrLevel, [
      [80, 'Ngeluurin kencang / Purring Loudly / ゴロゴロ'], [55, 'Ngeluurin pelan / Soft Purring / ゴロゴロ小さい'],
      [30, 'Dengkuran mulai / Starting To Purr / うー...'], [10, 'Tenang / Calm / 落ち着いてる']
    ], 'Senang sekali / Very Happy / ごきげん');
    const playLabel = classifyLevel(playUrge, [
      [80, 'Pengen Kejar-Kejaran / Wants To Chase / 遊びたい！'], [55, 'Gatal Mau Main / Itchy To Play / ちょっと遊びたい'],
      [30, 'Lumayan Bisa Diajak Main / Up For A Game / 遊べる'], [10, 'Sedang Kuy / Calm And Still / のんびり']
    ], 'Fokus Bermain / Focused On Play / 集中');
    const fishLabel = classifyLevel(fishCraving, [
      [80, 'Kangen Ikan Banget / Craving Fish / さかな食べたい！'], [55, 'Pengen Ikan / Wanting Fish / お魚ほしい'],
      [30, 'Lumayan Kangen Ikan / A Bit Craving Fish / ちょっとさかな'], [10, 'Biasa Aja / Fine / 平気']
    ], 'Puass / Satisfied / 満足');

    const hh = (h: number) => `${Math.floor(((h % 24) + 24) % 24).toString().padStart(2, '0')}:00`;
    const effectiveBedtimeText = hh(effectiveBedtime);
    const effectiveWakeText = hh(effectiveWake);
    const localClockText = hh(hour);

    let sleepStateText: string;
    let restText: string;
    if (v.sleepState === 'asleep') {
      const sleepMs = now - (v.asleepSince || now);
      sleepStateText = `Asleep (sleeping for ${Math.max(1, Math.round(sleepMs / HOUR_MS))}h, since around ${localClockText})`;
      restText = 'Resting peacefully right now; will wake refreshed when the window ends.';
    } else {
      const hoursAwake = (now - (v.lastSleepEnd || now)) / HOUR_MS;
      const debtText = v.sleepDebtMin > 30 ? ` | sleep debt ${Math.round(v.sleepDebtMin)} min` : '';
      sleepStateText = `Awake${debtText} (bedtime ${effectiveBedtimeText}, wake-up ${effectiveWakeText})`;
      restText = hoursAwake > 14
        ? 'Long day already - definitely needing rest soon.'
        : 'Recently well-rested.';
    }

    // --- Persist + export ---
    v.hunger = Math.round(hunger);
    v.thirst = Math.round(thirst);
    v.cleanliness = Math.round(cleanliness);
    v.bladder = Math.round(bladder);
    v.sleepiness = Math.round(sleepiness);
    v.effectiveBedtime = effectiveBedtimeText;
    v.effectiveWake = effectiveWakeText;
    v.purr = Math.round(purrLevel);
    v.tailState = tailState;
    v.earState = earState;
    v.playUrge = Math.round(playUrge);
    v.fishCraving = Math.round(fishCraving);
    v.energy = state.energy;
    v.status = state.status;
    state.systemHealth.lifeVitals = v;
    if (enableInventory) {
      state.systemHealth.lifeInventory = inventory;
    }
    context.lifeVitals = {
      hunger: Math.round(hunger),
      thirst: Math.round(thirst),
      cleanliness: Math.round(cleanliness),
      bladder: Math.round(bladder),
      sleepiness: Math.round(sleepiness),
      sleepState: v.sleepState,
      sleepDebtMin: Math.round(v.sleepDebtMin),
      effectiveBedtime: effectiveBedtimeText,
      effectiveWake: effectiveWakeText,
      purr: Math.round(purrLevel),
      tailState,
      earState,
      playUrge: Math.round(playUrge),
      fishCraving: Math.round(fishCraving),
      energy: state.energy,
      status: state.status
    };

    const inventoryText = enableInventory ? buildInventoryText(inventory) : 'Inventory disabled.';

    // --- Compile & inject the persona directive (voice guidance ONLY) ---
    const registry = PromptRegistry.getInstance();
    const template = config.promptTemplate || registry.get('life-simulation:physiology') || DEFAULT_LIFE_SIMULATION_PROMPT;
    registry.register('life-simulation:physiology', template, true);

    const compiledDirective = registry.compile('life-simulation:physiology', {
      hungerLevel: Math.round(hunger).toString(),
      hungerLabel,
      thirstLevel: Math.round(thirst).toString(),
      thirstLabel,
      cleanlinessLevel: Math.round(cleanliness).toString(),
      cleanlinessLabel,
      bladderLevel: Math.round(bladder).toString(),
      bladderLabel,
      sleepinessLevel: Math.round(sleepiness).toString(),
      sleepinessLabel,
      sleepStateText,
      effectiveBedtimeText,
      effectiveWakeText,
      restText,
      inventoryText,
      purrLevel: Math.round(purrLevel).toString(),
      purrLabel,
      tailState,
      earState,
      playLevel: Math.round(playUrge).toString(),
      playLabel,
      fishLevel: Math.round(fishCraving).toString(),
      fishLabel
    });

    // Append the Nekomata biology block to the directive (kept separate so the
    // default prompt stays backward-compatible with older saved templates).
    const compiledDirectiveWithNeko = enableNeko
      ? `${compiledDirective}\n\n# NEKOMATA BIOLOGY (INTERNAL — NEVER NARRATED)\n- Purring: ${Math.round(purrLevel)}% (${purrLabel})\n- Tail: ${tailState} | Ears: ${earState}\n- Play Urge: ${Math.round(playUrge)}% (${playLabel})\n- Fish Craving: ${Math.round(fishCraving)}% (${fishLabel})\n\nSilence rule: these cat-like states are internal only. Never describe your tail, ears, purring, or cravings unprompted in chat. They only subtly shape your tone (e.g. extra warm and content when purring is high, slightly restless wording when play urge is high). If the user pets you or gives you fish, you may react warmly in character without announcing the cause. Exception: if the user directly asks about your cat-like state (e.g. "lagi minta dibelai?", "kamu kangen ikan?"), you may answer truthfully and briefly.`
      : '';

    const currentDirective = context.soulDirective || '';
    const updatedDirective = `${currentDirective}\n\n# LIFE SIMULATION (PERSONA-ONLY)\n${compiledDirectiveWithNeko || compiledDirective}`;

    logs.push(`[LIFE_SIM] Lapar ${Math.round(hunger)}% | Haus ${Math.round(thirst)}% | Mandi ${Math.round(cleanliness)}% | Kebelep ${Math.round(bladder)}% | Kantuk ${Math.round(sleepiness)}% | ${v.sleepState}${affectStatusAndSleep ? ` | Status: ${state.status} | Energi ${state.energy}%` : ''} | Utang tidur ${Math.round(v.sleepDebtMin)}m | Tidur ${effectiveBedtimeText}-${effectiveWakeText}${enableNeko ? ` | Purr ${Math.round(purrLevel)}% | Ekor: ${tailState} | Main ${Math.round(playUrge)}% | Ikan ${Math.round(fishCraving)}%` : ''}`);

    return {
      ...context,
      soulDirective: updatedDirective.trim(),
      logs
    };
  }
};
