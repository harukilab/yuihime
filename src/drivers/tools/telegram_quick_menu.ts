import type { TgReply, TgToolContext } from './telegram_quick_tools.js';

/**
 * Telegram Quick Menu helpers — status text, care menu, inventory, and the
 * runCareAction state-machine for the 🧬 Care menu.
 *
 * Kept OUT of telegram_quick_tools.ts so that file stays focused on command
 * routing. This module is NOT a registered tool — it is imported statically by
 * telegram_quick_tools.ts and bundled into dist/server.cjs with it.
 *
 * To add a new care action:
 *   1. Add a `case 'myaction':` in runCareAction below.
 *   2. Optionally add a button in careMenuKeyboard() or careInventoryView().
 *   3. The callback routing `qt:care:<action>` is handled automatically by
 *      handleTgCallback in telegram_quick_tools.ts.
 */

export function fmtUptime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d} day${d > 1 ? 's' : ''}`);
  if (h > 0) parts.push(`${h} hr`);
  if (m > 0) parts.push(`${m} min`);
  parts.push(`${s} sec`);
  return parts.join(' ');
}

/**
 * Builds the *✦ YUI STATUS ✦* text: core state, life simulation (value + bar
 * on its own line), a single summary mood label, relation and active goals.
 * Returns Telegram Markdown text (safe for parse_mode: 'Markdown').
 */
export function yuiStatusText(tc?: TgToolContext): string {
  const s = tc?.settings || {};
  const db = tc?.db;
  const botActive = !!tc?.bot;
  const uptimeSec = (typeof process !== 'undefined' && process.uptime ? process.uptime() : 0);

  let state = { status: 'idle' } as any;
  let relation = {} as any;
  let mood = {} as any;
  let emotion = {} as any;
  let life = {} as any;
  let goals = 0;

  try {
    if (db) {
      const row = db.prepare('SELECT status, relation, mood, emotion, systemHealth FROM agent_state LIMIT 1').get() as any;
      if (row) {
        state = { ...state, ...row };
        if (row.relation) { try { relation = JSON.parse(row.relation); } catch {} }
        if (row.mood) { try { mood = JSON.parse(row.mood); } catch {} }
        if (row.emotion) { try { emotion = JSON.parse(row.emotion); } catch {} }
        if (row.systemHealth) {
          try { life = JSON.parse(row.systemHealth).lifeVitals || {}; } catch {}
        }
      }
      goals = Number((db.prepare("SELECT COUNT(*) AS n FROM goals WHERE status IN ('active','in_progress')").get() as any)?.n || 0);
    }
  } catch (err: any) {
    console.warn('[TG_QUICK_MENU] status text fallback:', err?.message || err);
  }

  const bar = (v: number) => {
    const n = Math.max(0, Math.min(10, Math.round((v ?? 0) / 10)));
    return '█'.repeat(n) + '░'.repeat(10 - n);
  };
  const val = (v: any) => (v === undefined || v === null ? '—' : String(v));

  const statusIcon =
    state.status === 'sleeping' ? '😴'
    : state.status === 'talking' ? '💬'
    : state.status === 'thinking' ? '🧠'
    : '🟢';

  const lines: string[] = [
    `*✦ YUI STATUS ✦*`,
    ``
  ];

  // ── Core state ──
  lines.push(
    `State    ${statusIcon} ${String(state.status || 'idle').toUpperCase()}`,
    `Bot      ${botActive ? '🟢 ACTIVE' : '🔴 INACTIVE'}`,
    `Uptime   ⏱️ ${fmtUptime(uptimeSec * 1000)}`
  );

  // ── Life simulation ──
  if (life && (life.hunger !== undefined || life.energy !== undefined || life.thirst !== undefined)) {
    const markBad = (v: number, badAt: number, midAt: number) => {
      const n = Number(v ?? 0);
      return n >= badAt ? '🔴' : n >= midAt ? '🟡' : '🟢';
    };
    const markGood = (v: number, badBelow: number, midBelow: number) => {
      const n = Number(v ?? 0);
      return n <= badBelow ? '🔴' : n <= midBelow ? '🟡' : '🟢';
    };
    const txtBad = (v: number, bad: string, mid: string, good: string) => {
      const n = Number(v ?? 0);
      return n >= 70 ? bad : n >= 40 ? mid : good;
    };
    const txtGood = (v: number, bad: string, mid: string, good: string) => {
      const n = Number(v ?? 0);
      return n <= 40 ? bad : n <= 70 ? mid : good;
    };

    lines.push(``, `*🧬 LIFE SIMULATION*`);
    const lifeRow = (label: string, v: any, mark: string, word: string) => {
      lines.push(`${label}: *${val(v)}%* ${mark} _${word}_`, `    ${bar(v)}`);
    };
    lifeRow(`🍽️ Hunger`, life.hunger, markBad(life.hunger, 70, 40), txtBad(life.hunger, 'Starving', 'Hungry', 'Full'));
    lifeRow(`💧 Thirst`, life.thirst, markBad(life.thirst, 70, 40), txtBad(life.thirst, 'Very Thirsty', 'Thirsty', 'Fresh'));
    lifeRow(`🚿 Cleanliness`, life.cleanliness, markGood(life.cleanliness, 40, 70), txtGood(life.cleanliness, 'Needs Bath', 'Slightly Dirty', 'Clean'));
    lifeRow(`🚽 Pee`, life.pee, markBad(life.pee, 70, 40), txtBad(life.pee, 'Urgent', 'Need To Go', 'Safe'));
    lifeRow(`💩 Poop`, life.poop, markBad(life.poop, 70, 40), txtBad(life.poop, 'Urgent', 'Need To Go', 'Safe'));
    lifeRow(`😴 Sleepiness`, life.sleepiness, markBad(life.sleepiness, 70, 40), txtBad(life.sleepiness, 'Sleep Deprived', 'Drowsy', 'Fresh'));
    lifeRow(`🔋 Energy`, life.energy, markGood(life.energy, 30, 60), txtGood(life.energy, 'Exhausted', 'Tired', 'Sufficient'));
    if (life.playUrge !== undefined || life.fishCraving !== undefined) {
      lines.push(`🎾 Play: *${val(life.playUrge)}%* ${markBad(life.playUrge, 70, 40)} · 🐟 Fish: *${val(life.fishCraving)}%* ${markBad(life.fishCraving, 70, 40)}`);
      lines.push(`    ${bar(life.playUrge)}`);
    }
    lines.push(`🛏️ Sleep: ${life.sleepState === 'asleep' ? '😴 _Asleep_' : '🙂 _Awake_'} (${val(life.effectiveBedtime)}–${val(life.effectiveWake)})`);
  }

  // ── Mood & emotion (single summary label) ──
  const moodSummary = (m: any, e: any) => {
    const mm = m || {};
    const ee = e || {};
    const toN = (x: any) => Number(x);
    const anger = toN(mm.anger) || 0;
    const stress = toN(mm.stress) || 0;
    const sadness = toN(mm.sadness) || 0;
    const joy = toN(mm.joy) || 0;
    const excitement = toN(mm.excitement) || 0;
    const playfulness = toN(mm.playfulness) || 0;
    const valence = toN(ee.valence);
    if (anger > 55) return ['😠', 'Angry'];
    if (stress > 70) return ['😰', 'Stressed'];
    if (sadness > 55 || (valence && valence < -25)) return ['😢', 'Sad'];
    if (joy > 70 && (!valence || valence > 30)) return ['😊', 'Happy'];
    if (excitement > 65) return ['🤩', 'Excited'];
    if (playfulness > 65) return ['🎮', 'Playful'];
    if (stress > 45) return ['😰', 'Tense'];
    return ['🙂', 'Content'];
  };
  const hasMood = (mood && Object.keys(mood).length > 0) ||
    (emotion && (emotion.arousal !== undefined || emotion.valence !== undefined || emotion.focus !== undefined));
  if (hasMood) {
    const [moodEmoji, moodLabel] = moodSummary(mood, emotion);
    lines.push(``, `*💖 MOOD*`, `${moodEmoji} ${moodLabel}`);
  }

  // ── Relation ──
  lines.push(
    ``,
    `*💗 RELATION*`,
    `❤️  Affection   ${val(relation.affection)}`,
    `🤝  Trust       ${val(relation.trust)}`
  );

  if (goals > 0) {
    lines.push(``, `🎯 Active goals: ${goals}`);
  }

  lines.push(``, `Use the buttons below for quick actions.`);
  return lines.join('\n');
}

export function menuText(tc?: TgToolContext): string {
  return yuiStatusText(tc);
}

/**
 * The 🧬 CARE MENU inline keyboard. `callback_data` follows the
 * `qt:care:<action>` scheme handled by handleTgCallback → runCareAction.
 */
export function careMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🍽️ Feed', callback_data: 'qt:care:eat' }, { text: '💧 Drink', callback_data: 'qt:care:drink' }, { text: '🚿 Bath', callback_data: 'qt:care:bath' }],
      [{ text: '🚽 Pee', callback_data: 'qt:care:pee' }, { text: '💩 Poop', callback_data: 'qt:care:poop' }, { text: '😴 Sleep', callback_data: 'qt:care:sleep' }],
      [{ text: '🎾 Play', callback_data: 'qt:care:play' }, { text: '🐟 Fish', callback_data: 'qt:care:fish' }, { text: '🎒 Inventory', callback_data: 'qt:care:inventory' }],
      [{ text: '📊 Status', callback_data: 'qt:care:status' }, { text: '« Menu', callback_data: 'qt:menu' }]
    ]
  };
}

/**
 * Executes a care action (callback sub-action or /care argument).
 *
 * Supported actions:
 *   eat/feed, drink, bath, pee/toilet, poop/bab, sleep, play, fish,
 *   status, inventory/inv/bag, invnew, invadd:<type>:<idx>, invdel:<type>:<idx>,
 *   invuse:<type>:<idx>
 *
 * Feeding/drinking when already full triggers the overfeed mechanic: hunger/
 * thirst drops toward overfeedFloor and the Poop/Pee fill boost scales with the
 * overfeed level, so repeatedly feeding a full Yui visibly raises her Poop/Pee
 * stats.
 */
export function runCareAction(action: string, tc: TgToolContext): TgReply {
  const db = tc?.db;
  if (!db) return { text: 'Database unavailable.' };
  const row = db.prepare('SELECT systemHealth FROM agent_state LIMIT 1').get() as any;
  const sh = (row && row.systemHealth) ? JSON.parse(row.systemHealth) : {};
  const v: any = sh.lifeVitals || {};
  const inv: any = sh.lifeInventory || { foods: [], drinks: [], items: [] };
  const a = String(action || '').toLowerCase();
  const now = Date.now();
  let text = '';

  // --- Life-simulation config (mirrors LifeSimulationModule) ---
  const HOUR_MS = 3600000;
  const lsCfg = (tc.settings?.['life-simulation'] || {}) as any;
  const hungerRate = Number(lsCfg.hungerRatePerHour ?? 9);
  const thirstRate = Number(lsCfg.thirstRatePerHour ?? 16);
  const cleanlinessRate = Number(lsCfg.cleanlinessRatePerHour ?? 4);
  const bladderRate = Number(lsCfg.bladderRatePerHour ?? 8);
  const poopRate = Number(lsCfg.poopRatePerHour ?? 5);
  const poopFill = Number(lsCfg.poopFillPerMeal ?? 12);
  const peeFillMeal = Number(lsCfg.peeFillPerMeal ?? 5);
  const peeFillDrink = Number(lsCfg.peeFillPerDrink ?? 8);
  const overfeedFloor = Number(lsCfg.overfeedFloor ?? -5);
  const permissionMode = lsCfg.enableSelfCarePermission !== undefined ? !!lsCfg.enableSelfCarePermission : false;
  const overMaxCap = Number(lsCfg.selfCareOverMaxCap !== undefined ? lsCfg.selfCareOverMaxCap : 200);
  const permSet = new Set(Array.isArray(lsCfg.selfCarePermissionActions) ? lsCfg.selfCarePermissionActions.map((x: any) => String(x)) : []);
  const capFor = (action: string): number =>
    (permissionMode && (permSet.size === 0 || permSet.has(action))) ? overMaxCap : 100;
  // Recompute the numeric vitals from timestamps so the status stays in sync
  // immediately (LifeSimulationModule only re-writes them on chat turns).
  const refreshVitals = () => {
    const n2 = Date.now();
    const mf = v.sleepState === 'asleep' ? 0.35 : 1;
    const cl = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
    v.hunger = Math.round(cl(((n2 - (v.lastMeal ?? n2)) / HOUR_MS) * hungerRate * mf + (v.hungerOffset || 0), overfeedFloor, capFor('eat')));
    v.thirst = Math.round(cl(((n2 - (v.lastDrink ?? n2)) / HOUR_MS) * thirstRate * mf + (v.thirstOffset || 0), overfeedFloor, capFor('drink')));
    v.cleanliness = Math.round(cl(100 - ((n2 - (v.lastBath ?? n2)) / HOUR_MS) * cleanlinessRate * mf, 0, capFor('bath')));
    v.pee = Math.round(cl(((n2 - (v.lastPee ?? n2)) / HOUR_MS) * bladderRate, 0, capFor('pee')));
    v.poop = Math.round(cl(((n2 - (v.lastPoop ?? n2)) / HOUR_MS) * poopRate, 0, capFor('poop')));
  };
  const persist = () => {
    refreshVitals();
    sh.lifeVitals = v;
    sh.lifeInventory = inv;
    db.prepare('UPDATE agent_state SET systemHealth = ? WHERE id = 1').run(JSON.stringify(sh));
  };

  const feedItem = (food: any): string => {
    food.qty -= 1;
    const addFill = (key: string, amount: number, rate: number, action: string) => {
      const elapsed = (now - (v[key] ?? now)) / HOUR_MS;
      const cap = capFor(action);
      const cur = Math.max(0, Math.min(cap, elapsed * rate));
      const newVal = Math.max(0, Math.min(cap, cur + amount));
      v[key] = now - (newVal / rate) * HOUR_MS;
    };
    const doFill = (mult: number) => {
      addFill('lastPoop', poopFill * mult, poopRate, 'poop');
      addFill('lastPee', peeFillMeal * mult, bladderRate, 'pee');
    };
    const preHunger = Math.max(0, ((now - (v.lastMeal ?? now)) / HOUR_MS) * hungerRate);
    const overfed = preHunger <= 5;
    v.lastMeal = now;
    if (overfed) {
      v.hungerOffset = Math.max(overfeedFloor, (v.hungerOffset || 0) - 5);
      const depth = Math.max(1, Math.floor(Math.abs(v.hungerOffset) / 5));
      doFill(1 + depth);
      v.hunger = v.hungerOffset;
      return `🍽️ Yuihime was already full but ate "${food.name}" anyway — overstuffed (hunger ${Math.round(v.hungerOffset)}%)! Poop +${poopFill * (1 + depth)}%, Pee +${peeFillMeal * (1 + depth)}%. (${food.qty} left)`;
    }
    v.hungerOffset = 0;
    doFill(1);
    v.hunger = 0;
    return `🍽️ Yuihime eats "${food.name}" — hunger 0%! Poop +${poopFill}%, Pee +${peeFillMeal}%. (${food.qty} left)`;
  };

  const drinkItem = (drink: any): string => {
    drink.qty -= 1;
    const addFill = (key: string, amount: number, rate: number, action: string) => {
      const elapsed = (now - (v[key] ?? now)) / HOUR_MS;
      const cap = capFor(action);
      const cur = Math.max(0, Math.min(cap, elapsed * rate));
      const newVal = Math.max(0, Math.min(cap, cur + amount));
      v[key] = now - (newVal / rate) * HOUR_MS;
    };
    const preThirst = Math.max(0, ((now - (v.lastDrink ?? now)) / HOUR_MS) * thirstRate);
    const overfed = preThirst <= 5;
    v.lastDrink = now;
    if (overfed) {
      v.thirstOffset = Math.max(overfeedFloor, (v.thirstOffset || 0) - 5);
      const depth = Math.max(1, Math.floor(Math.abs(v.thirstOffset) / 5));
      addFill('lastPee', peeFillDrink * (1 + depth), bladderRate, 'pee');
      v.thirst = v.thirstOffset;
      return `💧 Yuihime was already hydrated but drank "${drink.name}" anyway — overfull (thirst ${Math.round(v.thirstOffset)}%)! Pee +${peeFillDrink * (1 + depth)}%. (${drink.qty} left)`;
    }
    v.thirstOffset = 0;
    addFill('lastPee', peeFillDrink, bladderRate, 'pee');
    v.thirst = 0;
    return `💧 Yuihime drinks "${drink.name}" — thirst 0%! Pee +${peeFillDrink}%. (${drink.qty} left)`;
  };

  if (a.startsWith('invuse:')) {
    const [, type, idxStr] = a.split(':');
    const list = (inv[type] || []);
    const item = list[Number(idxStr)];
    if (!item || Number(item.qty || 0) <= 0) {
      return { text: '⚠️ Item unavailable.', keyboard: careInventoryView(inv).keyboard };
    }
    if (type === 'foods') {
      text = feedItem(item);
    } else if (type === 'drinks') {
      text = drinkItem(item);
    } else {
      item.qty -= 1;
      v.lastUse = now;
      if (item.aphrodisiac === true || /perangsang|afrodisiak|horn/i.test(String(item.name || item.id || ''))) {
        v.horn = 100;
        v.lastHornDecay = now;
        text = `💗 Yuihime uses "${item.name}" — horniness maxed out! (${item.qty} left)`;
      } else {
        text = `✨ Yuihime uses "${item.name}" — done! (${item.qty} left)`;
      }
    }
    persist();
    const view = careInventoryView(inv);
    return { text: `${text}\n\n${view.text}`, keyboard: view.keyboard };
  }

  if (a.startsWith('invaddqty:')) {
    const [, type, idxStr, qtyStr] = a.split(':');
    const list = (inv[type] || []);
    const item = list[Number(idxStr)];
    if (!item) {
      return { text: '⚠️ Item not found.', keyboard: careMenuKeyboard() };
    }
    const addQty = Math.max(1, Math.min(99, Number(qtyStr) || 1));
    item.qty = Number(item.qty || 0) + addQty;
    persist();
    const view = careInventoryView(inv);
    return { text: `➕ Added +${addQty} ${item.emoji || ''} ${item.name || item.id} (now x${item.qty}).\n\n${view.text}`, keyboard: view.keyboard };
  }

  if (a.startsWith('invadd:')) {
    const [, type, idxStr] = a.split(':');
    const list = (inv[type] || []);
    const item = list[Number(idxStr)];
    if (!item) {
      return { text: '⚠️ Item not found.', keyboard: careMenuKeyboard() };
    }
    item.qty = Number(item.qty || 0) + 1;
    persist();
    const view = careInventoryView(inv);
    return { text: `➕ Added +1 ${item.emoji || ''} ${item.name || item.id}.\n\n${view.text}`, keyboard: view.keyboard };
  }

  if (a.startsWith('invdel:')) {
    const [, type, idxStr] = a.split(':');
    const list = (inv[type] || []);
    const item = list[Number(idxStr)];
    if (!item) {
      return { text: '⚠️ Item not found.', keyboard: careInventoryView(inv).keyboard };
    }
    item.qty = Math.max(0, Number(item.qty || 0) - 1);
    if (item.qty <= 0) {
      list.splice(Number(idxStr), 1);
    }
    persist();
    const view = careInventoryView(inv);
    return {
      text: `${item.qty > 0 ? `🗑️ Removed 1x from ${item.emoji || ''} ${item.name} (${item.qty} left).` : `🗑️ Removed ${item.emoji || ''} ${item.name} entirely.`}\n\n${view.text}`,
      keyboard: view.keyboard
    };
  }

  switch (a) {
    case 'eat':
    case 'feed': {
      const food = (inv.foods || []).find((f: any) => f.qty > 0);
      if (food) {
        text = feedItem(food);
      } else {
        text = '🍽️ Food inventory is empty — nothing to feed Yuihime.';
      }
      break;
    }
    case 'drink': {
      const drink = (inv.drinks || []).find((d: any) => d.qty > 0);
      if (drink) {
        text = drinkItem(drink);
      } else {
        text = '💧 Drink inventory is empty — nothing for Yuihime to drink.';
      }
      break;
    }
    case 'bath':
      v.lastBath = now;
      v.cleanliness = 100;
      text = '🚿 Yuihime takes a bath — cleanliness 100%! Nyaaa~';
      break;
    case 'pee':
    case 'toilet':
      v.lastPee = now;
      v.pee = 0;
      text = '🚽 Yuihime uses the bathroom — pee relieved (0%).';
      break;
    case 'poop':
    case 'bab':
      v.lastPoop = now;
      v.poop = 0;
      text = '💩 Yuihime uses the bathroom — poop relieved (0%).';
      break;
    case 'sleep':
      v.sleepState = 'asleep';
      v.asleepSince = now;
      v.sleepiness = 5;
      text = '😴 Yuihime goes to sleep now. Good night~';
      break;
    case 'play':
      v.lastPlay = now;
      v.playUrge = 0;
      text = '🎾 Yuihime plays chase — play urge 0%!';
      break;
    case 'fish':
      v.lastFish = now;
      v.fishCraving = 0;
      text = '🐟 Yuihime is given fish — craving satisfied (0%)!';
      break;
    case 'status':
    case '':
      return { text: yuiStatusText(tc), parse_mode: 'Markdown' };
    case 'inventory':
    case 'inv':
    case 'bag':
      return careInventoryView(inv);
    case 'invnew':
      return {
        text: `➕ ADD CUSTOM ITEM\n\nCustom items appear under 🎒 ITEMS and can be added by typing:\n\n/invadd <nama> [jumlah]\n\nExample:\n/invadd Kue Coklat 3\n/invadd Buku Sakti\n\nRemove with:\n/invdel <nama> [jumlah]\n(without jumlah = remove entirely)\n\nOr just ask Yui in chat to add an item to her inventory.`,
        keyboard: careInventoryView(inv).keyboard
      };
    default:
      return { text: `⚠️ Unknown action: "${action}".\n\nUsage: /care <eat|drink|bath|pee|poop|sleep|play|fish|inventory>` };
  }
  persist();
  return {
    text: `${yuiStatusText(tc)}\n\n${text}\n\nTap the 🧬 Care buttons below to repeat — the menu stays open.`,
    keyboard: careMenuKeyboard(),
    parse_mode: 'Markdown'
  };
}

/**
 * 🎒 Inventory view: lists foods/drinks/items with Use / Add / Delete buttons.
 * The keyboard persists after every action so items can be used repeatedly.
 */
export function careInventoryView(inv: any): TgReply {
  const fmtItem = (it: any) => {
    const emoji = it.emoji || '·';
    const name = it.name || it.id || '?';
    const jp = it.jp ? ` (${it.jp})` : '';
    const qty = Number(it.qty || 0);
    return `${emoji} ${name}${jp} — ${qty > 0 ? `x${qty}` : '0'}`;
  };
  const foods = (inv.foods || []).map(fmtItem);
  const drinks = (inv.drinks || []).map(fmtItem);
  const items = (inv.items || []).map(fmtItem);
  const sections = [
    '🎒 YUI INVENTORY',
    '',
    '🍖 FOODS',
    ...(foods.length ? foods : ['(none)']),
    '',
    '🥤 DRINKS',
    ...(drinks.length ? drinks : ['(none)']),
    '',
    '🎒 ITEMS',
    ...(items.length ? items : ['(none)'])
  ];
  const total = (inv.foods || []).concat(inv.drinks || []).concat(inv.items || []).reduce((s, it) => s + Number(it.qty || 0), 0);
  sections.push('', `Total items: ${total}`, '', 'Tap an item button to use it (menu stays open for repeat use):');

  const longName = (it: any) => String(it.name || it.id || '?').slice(0, 32);
  const keyboard: any[][] = [];
  const pushUseRows = (type: string, useEmoji: string) => {
    (inv[type] || []).forEach((it: any, i: number) => {
      keyboard.push([
        { text: `${useEmoji} ${it.emoji || '·'} ${longName(it)}`, callback_data: `qt:care:invuse:${type}:${i}` }
      ]);
      keyboard.push([
        { text: '+1', callback_data: `qt:care:invaddqty:${type}:${i}:1` },
        { text: '+5', callback_data: `qt:care:invaddqty:${type}:${i}:5` },
        { text: '+10', callback_data: `qt:care:invaddqty:${type}:${i}:10` },
        { text: '🗑️', callback_data: `qt:care:invdel:${type}:${i}` }
      ]);
    });
  };
  pushUseRows('foods', '🍽️');
  pushUseRows('drinks', '🥤');
  (inv.items || []).forEach((it: any, i: number) => {
    keyboard.push([
      { text: `✨ ${it.emoji || '·'} ${longName(it)}`, callback_data: `qt:care:invuse:items:${i}` }
    ]);
    keyboard.push([
      { text: '+1', callback_data: `qt:care:invaddqty:items:${i}:1` },
      { text: '+5', callback_data: `qt:care:invaddqty:items:${i}:5` },
      { text: '+10', callback_data: `qt:care:invaddqty:items:${i}:10` },
      { text: '🗑️', callback_data: `qt:care:invdel:items:${i}` }
    ]);
  });
  keyboard.push([{ text: '➕ Custom item', callback_data: 'qt:care:invnew' }]);
  keyboard.push([{ text: '« Care', callback_data: 'qt:care' }, { text: '« Menu', callback_data: 'qt:menu' }]);
  return { text: sections.join('\n').slice(0, 3000), keyboard: { inline_keyboard: keyboard } };
}
