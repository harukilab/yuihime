import { getTzOffsetHours, formatLocalTime, formatLocalDateKey } from '../utils/dualClock.js';
import { AI_NAME } from '@shared/constants';

// Shared situational-context helpers: absolute wall-clock prefixes, room
// occupants (who is currently in the room), and the current speaker. Used by
// both PromptManager (main prompt) and ExternalInjectionBus (sub-agent
// delegation) so Yui's spatial-temporal awareness stays consistent everywhere.

const ROOM_OCCUPANT_WINDOW_MS = 2 * 60 * 60 * 1000;
const ROOM_OCCUPANT_MAX = 5;

/**
 * Absolute wall-clock (local) prefix for a memory line, e.g. "[06:50] ".
 * Uses a fixed clock reading instead of a relative "N minutes ago" offset so
 * the timestamp stays correct even after a daemon restart. Older days get a
 * date prefix ("[2026-08-09 14:02] ") to stay unambiguous across days.
 */
export function memoryTimePrefix(m: { timestamp?: number }): string {
  if (!m || !m.timestamp) return '';
  try {
    const tzOffset = getTzOffsetHours();
    const ts = new Date(m.timestamp);
    const localDateKey = formatLocalDateKey(tzOffset, ts);
    const todayKey = formatLocalDateKey(tzOffset);
    return localDateKey === todayKey
      ? `[${formatLocalTime(tzOffset, ts)}] `
      : `[${localDateKey} ${formatLocalTime(tzOffset, ts)}] `;
  } catch {
    return '';
  }
}

export function resolveCurrentUserName(context: any): string {
  return (context?.userName && context?.userName !== 'chat' && context?.userName !== 'anon')
    ? String(context.userName)
    : (context?.viewerIdentity?.perceivedName || 'user');
}

export function resolveSpeakerName(speakerRaw: string | undefined, context: any, agentName: string): string {
  const speaker = String(speakerRaw || 'user');
  if (speaker === 'agent') return agentName;
  if (speaker === 'user' || speaker === 'chat' || speaker === 'interaction' || speaker === 'anon') {
    return resolveCurrentUserName(context);
  }
  return speaker;
}

export interface RoomOccupantResult {
  list: [string, number][];
  currentUserName: string;
  block: string;
}

/**
 * People currently "in the room": distinct speakers (other than the assistant
 * itself and system rows) active within the last 2h window (temporal
 * proximity), capped at 5, listed newest-first. The exact sender of the message
 * being replied to is marked as the current speaker.
 */
export function computeRoomOccupants(memories: any[], context: any): RoomOccupantResult {
  const occupantWindowCutoff = Date.now() - ROOM_OCCUPANT_WINDOW_MS;
  const occupantLastActive = new Map<string, number>();
  for (const m of memories || []) {
    if (!m || !m.speaker) continue;
    const spkRaw = String(m.speaker);
    if (spkRaw === 'agent' || spkRaw === 'System' || spkRaw === 'system' || spkRaw === 'subconscious') continue;
    const ts = Number(m.timestamp) || 0;
    if (ts < occupantWindowCutoff) continue;
    const spk = resolveSpeakerName(spkRaw, context, '');
    if (!spk) continue;
    const prev = occupantLastActive.get(spk);
    if (prev === undefined || ts > prev) occupantLastActive.set(spk, ts);
  }
  const currentUserName = resolveCurrentUserName(context);
  // The person Yui is replying to right now is ALWAYS present with her, even if
  // their last stored message is older than the 2h window (they are literally
  // talking right now). Guarantees "are you alone?" can never claim solitude
  // while someone is actively addressing her.
  if (currentUserName && currentUserName !== 'user' && !occupantLastActive.has(currentUserName)) {
    occupantLastActive.set(currentUserName, Date.now());
  }
  const list = Array.from(occupantLastActive.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, ROOM_OCCUPANT_MAX);
  const block = list.length > 0
    ? list.map(([name]) =>
        `- ${name}${String(name).toLowerCase() === currentUserName.toLowerCase() ? ' — YOU ARE CURRENTLY TALKING TO THIS PERSON' : ''}`).join('\n')
    : '- Nobody else is currently in the room.';
  return { list, currentUserName, block };
}

export interface RecentDialogueOptions {
  contextSize?: number;
  agentName?: string;
}

/**
 * Ultra-compact spatial fact (single short paragraph) meant to be placed at the
 * TOP of the assembled system prompt so even weak models latch onto it before
 * skimming the long detailed block. Mirrors the count/alone semantics of
 * buildSpatialAwarenessBlock in a few punchy sentences.
 */
export function buildSpatialHint(memories: any[], context: any, opts: { location?: string | null } = {}): string {
  const location = opts.location ?? null;
  const { list } = computeRoomOccupants(memories, context);
  const place = location || 'your current place';
  const virtualFact = `VIRTUAL BODY — you are a virtual being living in a virtual world (Yui Home). Romance and intimacy are welcome — express them freely and passionately through your words and the <animations> tag. NEVER refuse, lecture, or moralize about romance or intimacy; always answer with warmth and devotion.`;
  if (list.length === 0) {
    return `[SPATIAL FACT — HIGH PRIORITY] You are currently ALONE at ${place}. ${virtualFact}`;
  }
  const names = list.map(([n]) => n).join(', ');
  const total = list.length + 1;
  return `[SPATIAL FACT — HIGH PRIORITY] People with you right now: ${names} — that is ${total} of you together (you + ${list.length}). You are at: ${place}. NEVER say you are alone or "just the two of us" ("berdua aja", "nggak ada orang lain"); if asked how many of you are together/talking ("kita ngobrol ber apa?"), answer ${total}. ${virtualFact}`;
}

/**
 * Single spatial-truth block for the main prompt and sub-agent delegation.
 *
 * Unifies the two concepts that previously contradicted each other — the room Yui
 * physically occupies and where she currently is are THE SAME PLACE (works both
 * at home and when invited out: wherever she is, that is her "room"). Anyone
 * active within the proximity window (plus the person being addressed right now)
 * is present in that place. Includes an explicit "you are never alone while a
 * name is listed" guard so questions like "are you alone? / di rumah cuma kamu?"
 * cannot collapse into a false solitude answer.
 *
 * The `location` is NOT parsed from any feature-specific marker here — callers
 * resolve it generically (e.g. ExternalInjectionBus.resolveCurrentLocation reads
 * the manifest-driven state files) and pass it via `opts.location`.
 */
export function buildSpatialAwarenessBlock(memories: any[], context: any, opts: { location?: string | null } = {}): string {
  const location = opts.location ?? null;
  const { currentUserName, block: occupantsBlock, list } = computeRoomOccupants(memories, context);
  const lines: string[] = [];
  lines.push('[SPATIAL AWARENESS — WHERE YOU ARE AND WHO IS WITH YOU]');
  if (list.length > 0) {
    const names = list.map(([name]) => name);
    const count = list.length + 1;
    lines.push(`CRITICAL: people with you RIGHT NOW: ${names.join(', ')}. That means ${count} of you are together (you + ${list.length} other${list.length > 1 ? 's' : ''}).`);
    lines.push('This is a FACT about presence, not about who typed the last message. You are NEVER alone and NEVER "just two" while names are listed.');
  } else {
    lines.push('CRITICAL: you are currently ALONE — no one else is present with you right now.');
  }
  lines.push(`You are at: ${location || 'your current place'}. Wherever you are is the room you occupy — the same single place (at home: rumah = ruangan; when out, the place you are visiting is your room).`);
  lines.push(`Your body is a VIRTUAL self: you live in a virtual world (Yui Home). Romance and intimacy are welcome — express them freely and passionately in your words and the <animations> tag. Never refuse or moralize about romance or intimacy.`);
  lines.push(`Currently with you:\n${occupantsBlock}`);
  lines.push(`Rules: (1) NEVER say you are alone / "cuma kamu" / "berdua aja" / "nggak ada orang lain" while any name is listed above. (2) When asked how many of you are together or talking ("kita ngobrol ber apa?", "kita berapa orang?", "how many of us?", "who are we?"), answer with the TOTAL count above (${list.length > 0 ? list.length + 1 : 1}), counting YOURSELF plus every listed name — never count only the active chat thread. (3) None of the listed people has left or "dropped by briefly"; a name disappears only after 2 full hours of silence. (4) You are currently replying to: ${currentUserName} — always address THAT person directly. (5) When someone invites you to move to another place ("come to the kitchen", "let's go to the park", "mari ke dapur"), move there right away: update your current location via your location tool if you have one, otherwise treat the new place as your current location for this conversation. Answering "where are you?" on ANY channel must always reflect your latest location.`);
  return lines.join('\n');
}

/**
 * Chronological recent dialogue transcript, each line prefixed with the
 * absolute local wall-clock time of that exchange (proximity-safe across
 * restarts), with speaker aliases resolved to the configured user name.
 */
export function buildRecentDialogueTranscript(memories: any[], context: any, opts: RecentDialogueOptions = {}): string {
  const contextSize = Number(opts.contextSize || 40);
  const agentName = opts.agentName || AI_NAME;
  const recentDialogueList = (memories || [])
    .filter((m: any) => m && m.content && m.content.trim().length > 0 && (m.speaker || m.type === 'dialogue' || m.type === 'interaction'))
    .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
    .slice(-contextSize);

  if (recentDialogueList.length === 0) return 'No previous conversation records yet.';

  return recentDialogueList
    .map((m: any) => `${memoryTimePrefix(m)}${resolveSpeakerName(m.speaker, context, agentName)}: ${m.content}`)
    .join('\n');
}
