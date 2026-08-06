/**
 * goalDecomposition.ts
 *
 * Recursive goal decomposition (Stage F): goals are stored hierarchically
 * (parent -> subgoals). Closed-loop monitoring: every subgoal progress
 * updates the parent progress recursively; when all subgoals are done,
 * the parent is auto-completed — up to the root. The SOUL module reads the
 * active selected goal as the focus of the cycle.
 *
 * Only allowed on the Node (daemon) side.
 */

import { getDb } from './database.js';
import { genId } from '@shared/core/idGen';

export interface Goal {
  id: string;
  parent_id: string | null;
  title: string;
  description: string;
  status: 'active' | 'in_progress' | 'completed' | 'abandoned';
  progress: number;
  category: string;
  note: string;
  context_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface GoalCheckin {
  id: string;
  goal_id: string;
  note: string;
  progress_delta: number;
  status_change: string;
  created_at: number;
}

let cache: any = null;

/**
 * Maximum number of active ROOT goals (active/in_progress) to prevent
 * the goals database from growing out of control (self-proposal + user request).
 * Sub-goals are not counted, but their number is bounded by the roots.
 */
let maxActiveGoals = 20;

export function setMaxActiveGoals(n: number): void {
  if (Number.isFinite(n) && n >= 1) maxActiveGoals = Math.round(n);
}

export function getActiveGoalCount(): number {
  try {
    const row = getDb()
      .prepare(`SELECT COUNT(*) AS n FROM goals WHERE parent_id IS NULL AND status IN ('active','in_progress')`)
      .get() as any;
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

function stmts(db: any): any {
  if (cache) return cache;
  cache = {
    get: db.prepare('SELECT * FROM goals WHERE id = ?'),
    insert: db.prepare(
      `INSERT INTO goals (id, parent_id, title, description, status, progress, category, note, context_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    children: db.prepare('SELECT * FROM goals WHERE parent_id = ? ORDER BY created_at ASC'),
    active: db.prepare(
      `SELECT * FROM goals WHERE status IN ('active','in_progress') ORDER BY created_at DESC LIMIT ?`
    ),
    all: db.prepare('SELECT * FROM goals ORDER BY created_at DESC LIMIT ?'),
    updateStatus: db.prepare('UPDATE goals SET status = ?, progress = ?, updated_at = ? WHERE id = ?'),
    updateProgress: db.prepare('UPDATE goals SET progress = ?, status = ?, updated_at = ? WHERE id = ?'),
    lastProposal: db.prepare(
      `SELECT MAX(created_at) AS last FROM goal_proposals WHERE source = ?`
    ),
    insertProposal: db.prepare(
      `INSERT INTO goal_proposals (source, root_goal_id, created_at) VALUES (?, ?, ?)`
    ),
    insertCheckin: db.prepare(
      `INSERT INTO goal_checkins (id, goal_id, note, progress_delta, status_change, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ),
    checkins: db.prepare('SELECT * FROM goal_checkins WHERE goal_id = ? ORDER BY created_at DESC LIMIT ?')
  };
  return cache;
}

export function resetGoalCache() {
  cache = null;
}

export function uid(prefix = 'goal'): string {
  return `${prefix}_${Date.now()}_${genId(8)}`;
}

function rowToGoal(row: any): Goal | null {
  if (!row) return null;
  return {
    id: row.id,
    parent_id: row.parent_id || null,
    title: row.title || 'Untitled goal',
    description: row.description || '',
    status: row.status || 'active',
    progress: Number(row.progress || 0),
    category: row.category || 'general',
    note: row.note || '',
    context_id: row.context_id || null,
    created_at: row.created_at || Date.now(),
    updated_at: row.updated_at || Date.now()
  };
}

function rowToCheckin(row: any): GoalCheckin | null {
  if (!row) return null;
  return {
    id: row.id,
    goal_id: row.goal_id,
    note: row.note || '',
    progress_delta: Number(row.progress_delta || 0),
    status_change: row.status_change || '',
    created_at: row.created_at || Date.now()
  };
}

function tokenizeGoalText(text: string): string[] {
  return Array.from(new Set(
    (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [])
      .filter((w: string) => w.length >= 3)
  ));
}

/**
 * Normalize a goal text into a comparable key (lowercase, alnum, single-space).
 */
function normalizeGoalKey(text: string): string {
  return (String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim());
}

/**
 * Token-based overlap ratio between two goal texts (title + description).
 * Exact / substring matches score 1; otherwise Jaccard over 3+ char tokens.
 * 0 = unrelated, 1 = identical vocabulary.
 */
export function goalTextSimilarity(a: string, b: string): number {
  const keyA = normalizeGoalKey(a);
  const keyB = normalizeGoalKey(b);
  if (!keyA || !keyB) return 0;
  if (keyA === keyB) return 1;
  if (keyA.length >= 4 && keyB.length >= 4 && (keyA.includes(keyB) || keyB.includes(keyA))) return 1;
  const ta = tokenizeGoalText(a);
  const tb = tokenizeGoalText(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const hits = ta.filter((w) => setB.has(w)).length;
  return hits / Math.max(1, Math.min(ta.length, tb.length));
}

/**
 * Find an existing ACTIVE root goal that clashes with a proposed goal
 * (title/description). Returns the closest match above the overlap threshold,
 * or null when no existing goal conflicts.
 */
export function findSimilarActiveGoal(title: string, description = '', threshold = 0.55): Goal | null {
  const proposed = `${title} ${description}`;
  let best: Goal | null = null;
  let bestScore = threshold;
  for (const g of listActiveGoals(50)) {
    const score = goalTextSimilarity(proposed, `${g.title} ${g.description}`);
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  return best;
}

export function createGoal(data: { title: string; description?: string; category?: string; parentId?: string | null; contextId?: string | null; dedupe?: boolean }): Goal | null {
  try {
    const db = getDb();
    const id = uid('goal');
    const now = Date.now();
    const parentId = data.parentId || null;
    if (!parentId && getActiveGoalCount() >= maxActiveGoals) {
      console.warn(`[GOAL] Active root goal limit reached (${maxActiveGoals}). Goal "${data.title}" rejected.`);
      return null;
    }
    const dedupe = data.dedupe !== false;
    if (dedupe && !parentId) {
      const clash = findSimilarActiveGoal(data.title, data.description || '');
      if (clash) {
        console.warn(`[GOAL] Duplicate guard: "${data.title}" clashes with existing goal "${clash.title}" (${clash.id}). New goal rejected.`);
        return null;
      }
    }
    stmts(db).insert.run(
      id, parentId, data.title, data.description || '', 'active', 0,
      data.category || 'general', '', data.contextId || null, now, now
    );
    if (parentId) {
      touchGoal(parentId);
    }
    return rowToGoal(stmts(db).get.get(id));
  } catch (err: any) {
    console.warn('[GOAL] Failed to create goal:', err?.message || err);
    return null;
  }
}

function touchGoal(id: string): void {
  try {
    stmts(getDb()).updateStatus.run('in_progress', 0, Date.now(), id);
  } catch { /* ignore */ }
}

export function getGoal(id: string): Goal | null {
  try {
    return rowToGoal(stmts(getDb()).get.get(id));
  } catch { return null; }
}

export function listGoals(limit = 100): Goal[] {
  try {
    return (stmts(getDb()).all.all(limit) as any[]).map(rowToGoal).filter(Boolean) as Goal[];
  } catch { return []; }
}

export function listActiveGoals(limit = 20, contextId?: string | null): Goal[] {
  try {
    const db = getDb();
    if (contextId) {
      return (db.prepare(
        `SELECT * FROM goals WHERE status IN ('active','in_progress') AND context_id = ? ORDER BY created_at DESC LIMIT ?`
      ).all(contextId, limit) as any[]).map(rowToGoal).filter(Boolean) as Goal[];
    }
    return (stmts(db).active.all(limit) as any[]).map(rowToGoal).filter(Boolean) as Goal[];
  } catch { return []; }
}

export function setGoalContext(id: string, contextId: string | null): Goal | null {
  try {
    stmts(getDb()).get.get(id);
    getDb().prepare('UPDATE goals SET context_id = ?, updated_at = ? WHERE id = ?').run(contextId, Date.now(), id);
    return getGoal(id);
  } catch (err: any) {
    console.warn('[GOAL] Failed to set context:', err?.message || err);
    return getGoal(id);
  }
}

export function getGoalChildren(id: string): Goal[] {
  try {
    return (stmts(getDb()).children.all(id) as any[]).map(rowToGoal).filter(Boolean) as Goal[];
  } catch { return []; }
}

/**
 * Progress of a goal (recursive re-evaluation). When a goal has subgoals,
 * progress = average of active subgoal progress, and when all are done,
 * the goal auto-completes (closed-loop). Then it ascends to the parent.
 */
export function recomputeGoal(id: string): Goal | null {
  try {
    const db = getDb();
    const goal = getGoal(id);
    if (!goal || goal.status === 'completed' || goal.status === 'abandoned') return goal;

    const children = getGoalChildren(id);
    if (children.length > 0) {
      const avg = children.reduce((sum, c) => sum + c.progress, 0) / children.length;
      const allDone = children.every((c) => c.status === 'completed');
      const nextStatus = allDone ? 'completed' : avg > 0 ? 'in_progress' : 'active';
      stmts(db).updateProgress.run(Math.round(avg * 100) / 100, nextStatus, Date.now(), id);
      const updated = getGoal(id)!;
      if (nextStatus === 'completed' && updated.parent_id) {
        recomputeGoal(updated.parent_id);
      }
      return updated;
    }
    return goal;
  } catch (err: any) {
    console.warn('[GOAL] Failed to recompute:', err?.message || err);
    return getGoal(id);
  }
}

/**
 * Add leaf-goal progress then propagate upward (recursively).
 */
export function advanceGoal(id: string, delta: number): Goal | null {
  try {
    const db = getDb();
    const goal = getGoal(id);
    if (!goal || goal.status === 'completed' || goal.status === 'abandoned') return goal;
    const children = getGoalChildren(id);
    const progress = Math.max(0, Math.min(1, (goal.progress || 0) + delta));
    const status = progress >= 1 ? 'completed' : progress > 0 ? 'in_progress' : 'active';
    stmts(db).updateProgress.run(progress, status, Date.now(), id);
    if (children.length === 0 && status === 'completed' && goal.parent_id) {
      recomputeGoal(goal.parent_id);
    }
    return getGoal(id);
  } catch (err: any) {
    console.warn('[GOAL] Failed to advance:', err?.message || err);
    return getGoal(id);
  }
}

export function completeGoal(id: string): Goal | null {
  try {
    const db = getDb();
    const goal = getGoal(id);
    if (!goal) return null;
    stmts(db).updateStatus.run('completed', 1, Date.now(), id);
    if (goal.parent_id) {
      recomputeGoal(goal.parent_id);
    }
    return getGoal(id);
  } catch (err: any) {
    console.warn('[GOAL] Failed to complete:', err?.message || err);
    return getGoal(id);
  }
}

export function abandonGoal(id: string): Goal | null {
  try {
    stmts(getDb()).updateStatus.run('abandoned', 0, Date.now(), id);
    return getGoal(id);
  } catch (err: any) {
    console.warn('[GOAL] Failed to abandon:', err?.message || err);
    return getGoal(id);
  }
}

/**
 * Append a progress note to a goal's check-in ledger (long-horizon trail).
 */
export function createGoalCheckin(id: string, note: string, progressDelta = 0): GoalCheckin | null {
  try {
    const db = getDb();
    const goal = getGoal(id);
    if (!goal) return null;
    const delta = Number.isFinite(progressDelta) ? progressDelta : 0;
    const before = goal.status;
    const advanced = delta !== 0 ? advanceGoal(id, delta) : goal;
    const after = advanced?.status || before;
    const statusChange = before !== after ? `${before}->${after}` : '';
    const checkin: GoalCheckin = {
      id: uid('chk'),
      goal_id: id,
      note: String(note || '').slice(0, 500),
      progress_delta: delta,
      status_change: statusChange,
      created_at: Date.now()
    };
    stmts(db).insertCheckin.run(checkin.id, checkin.goal_id, checkin.note, checkin.progress_delta, checkin.status_change, checkin.created_at);
    if (statusChange) {
      touchGoal(id);
    }
    return checkin;
  } catch (err: any) {
    console.warn('[GOAL] Failed to create checkin:', err?.message || err);
    return null;
  }
}

/**
 * Read the check-in ledger of a goal (newest first).
 */
export function getGoalCheckins(id: string, limit = 10): GoalCheckin[] {
  try {
    return (stmts(getDb()).checkins.all(id, limit) as any[]).map(rowToCheckin).filter(Boolean) as GoalCheckin[];
  } catch { return []; }
}

/**
 * Recursive decomposition: split a goal into subgoals.
 */
export function decomposeGoal(id: string, subgoals: { title: string; description?: string }[]): Goal[] {
  const created: Goal[] = [];
  const parent = getGoal(id);
  for (const sg of subgoals) {
    const g = createGoal({
      title: sg.title,
      description: sg.description,
      category: parent?.category,
      parentId: id,
      contextId: parent?.context_id,
      dedupe: false
    });
    if (g) created.push(g);
  }
  recomputeGoal(id);
  return created;
}

/**
 * Focus goal for the current cycle: prioritize in_progress (newest),
 * then the oldest active goal with no progress yet that is still relevant.
 */
export function getFocusGoal(now: number = Date.now()): Goal | null {
  const active = listActiveGoals(50);
  if (active.length === 0) return null;
  const fresh = active.filter((g) => (now - g.updated_at) < 24 * 60 * 60 * 1000);
  const pool = fresh.length > 0 ? fresh : active;
  const prioritized = [...pool].sort((a, b) => {
    const aScore = (a.status === 'in_progress' ? 1 : 0) + (a.updated_at - now) / 1000 / 1e6;
    const bScore = (b.status === 'in_progress' ? 1 : 0) + (b.updated_at - now) / 1000 / 1e6;
    return bScore - aScore;
  });
  return prioritized[0] || null;
}

/**
 * Build a trilingual directive block for the focus goal.
 */
export function buildGoalDirective(goal: Goal): string {
  const children = getGoalChildren(goal.id);
  const childLines = children.length > 0
    ? children.map((c: Goal) => `  - ${c.status === 'completed' ? '[x]' : '[ ]'} (${Math.round(c.progress * 100)}%) ${c.title}`).join('\n')
    : '  - (sub-goals not yet decomposed)';
  return [
    '',
    '# CURRENT GOAL FOCUS (RECURSIVE MONITORING)',
    `- **${goal.title}** — ${Math.round((goal.progress || 0) * 100)}%`,
    goal.description ? `- ${goal.description}` : '',
    childLines,
    '',
    '[EN] Keep this goal in mind; if today\'s conversation touches it, nudge it forward naturally. [ID] Ingat goal ini; bila obrolan hari ini menyentuhnya, dorong maju dengan natural. [JP] この目標を心に留め、今日の会話が関係するなら自然に前へ進めてください。'
  ].filter(Boolean).join('\n');
}

/**
 * Build a directive listing ALL active goals (long-horizon overview), with the
 * focus goal marked first. Merged into the soul directive by GoalDecompositionModule.
 */
export function buildActiveGoalsDirective(goals: Goal[], focusId: string | null = null): string {
  if (!goals || goals.length === 0) return '';
  const lines = [
    '',
    '# LONG-HORIZON GOALS OVERVIEW',
    '[EN] Below are all your active long-horizon goals. Keep them visible; only push the current focus forward in conversation. Do not create duplicate goals for these. [ID] Berikut semua goal jangka-panjang yang aktif. Jangan membuat goal duplikat untuk hal yang sudah ada di sini. [JP] 以下は進行中の長期的目標です。重複する目標を作らないでください。'
  ];
  for (const g of goals) {
    const mark = g.id === focusId ? ' (FOCUS)' : '';
    lines.push(`- [${g.status === 'in_progress' ? '~' : ' '}] ${Math.round((g.progress || 0) * 100)}% ${g.title}${mark}`);
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Throttle self-proposal: returns true if the cooldown has passed since the last
 * automatic proposal (or none has ever been made).
 */
export function isProposalThrottled(source = 'auto', cooldownMs: number): boolean {
  try {
    const row = stmts(getDb()).lastProposal.get(source) as any;
    if (!row || !row.last) return false;
    return (Date.now() - Number(row.last)) < cooldownMs;
  } catch {
    return false;
  }
}

/**
 * Record a proposal so throttling works.
 */
export function recordProposal(source: string, rootGoalId: string): void {
  try {
    stmts(getDb()).insertProposal.run(source, rootGoalId, Date.now());
  } catch (err: any) {
    console.warn('[GOAL] Failed to record proposal:', err?.message || err);
  }
}

/**
 * Keyword similarity between a conversation text and a goal (title/description/sub).
 * Returns the list of matching words; for context-touch detection.
 */
export function goalKeywordOverlap(goal: Goal, text: string): string[] {
  const textTokens = new Set(
    (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [])
      .filter((w: string) => w.length >= 3)
  );
  const goalTokens = new Set(
    `${goal.title} ${goal.description} ${getGoalChildren(goal.id).map((c) => c.title).join(' ')}`
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []
  );
  const matches: string[] = [];
  for (const tok of goalTokens) {
    if (tok.length < 3) continue;
    if (textTokens.has(tok)) matches.push(tok);
  }
  return matches;
}
