/**
 * goalDecomposition.ts
 *
 * Recursive goal decomposition (Stage F): goals disimpan secara hierarkis
 * (parent -> subgoals). Closed-loop monitoring: setiap kemajuan subgoal
 * memperbarui progress parent secara rekursif; saat semua subgoal selesai,
 * parent otomatis ter-complete — naik sampai akar. Modul SOUL membaca goal
 * aktif terpilih sebagai fokus siklus.
 *
 * Hanya boleh dipakai di sisi Node (daemon).
 */

import { getDb } from './database.js';

export interface Goal {
  id: string;
  parent_id: string | null;
  title: string;
  description: string;
  status: 'active' | 'in_progress' | 'completed' | 'abandoned';
  progress: number;
  category: string;
  note: string;
  created_at: number;
  updated_at: number;
}

let cache: any = null;

function stmts(db: any): any {
  if (cache) return cache;
  cache = {
    get: db.prepare('SELECT * FROM goals WHERE id = ?'),
    insert: db.prepare(
      `INSERT INTO goals (id, parent_id, title, description, status, progress, category, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    children: db.prepare('SELECT * FROM goals WHERE parent_id = ? ORDER BY created_at ASC'),
    active: db.prepare(
      `SELECT * FROM goals WHERE status IN ('active','in_progress') ORDER BY created_at DESC LIMIT ?`
    ),
    all: db.prepare('SELECT * FROM goals ORDER BY created_at DESC LIMIT ?'),
    updateStatus: db.prepare('UPDATE goals SET status = ?, progress = ?, updated_at = ? WHERE id = ?'),
    updateProgress: db.prepare('UPDATE goals SET progress = ?, status = ?, updated_at = ? WHERE id = ?')
  };
  return cache;
}

export function resetGoalCache() {
  cache = null;
}

export function uid(prefix = 'goal'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    created_at: row.created_at || Date.now(),
    updated_at: row.updated_at || Date.now()
  };
}

export function createGoal(data: { title: string; description?: string; category?: string; parentId?: string | null }): Goal | null {
  try {
    const db = getDb();
    const id = uid('goal');
    const now = Date.now();
    const parentId = data.parentId || null;
    stmts(db).insert.run(
      id, parentId, data.title, data.description || '', 'active', 0,
      data.category || 'general', '', now, now
    );
    if (parentId) {
      touchGoal(parentId);
    }
    return rowToGoal(stmts(db).get.get(id));
  } catch (err: any) {
    console.warn('[GOAL] Gagal membuat goal:', err?.message || err);
    return null;
  }
}

function touchGoal(id: string): void {
  try {
    stmts(getDb()).updateStatus.run('in_progress', 0, Date.now(), id);
  } catch { /* abaikan */ }
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

export function listActiveGoals(limit = 20): Goal[] {
  try {
    return (stmts(getDb()).active.all(limit) as any[]).map(rowToGoal).filter(Boolean) as Goal[];
  } catch { return []; }
}

export function getGoalChildren(id: string): Goal[] {
  try {
    return (stmts(getDb()).children.all(id) as any[]).map(rowToGoal).filter(Boolean) as Goal[];
  } catch { return []; }
}

/**
 * Kemajuan sebuah goal (re-evaluasi rekursif). Bila goal punya subgoals,
 * progress = rata-rata progress subgoal aktif, dan bila semua selesai,
 * goal otomatis complete (closed-loop). Lalu naik ke parent.
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
    console.warn('[GOAL] Gagal recompute:', err?.message || err);
    return getGoal(id);
  }
}

/**
 * Tambah kemajuan leaf-goal lalu propagate ke atas (rekursif).
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
    console.warn('[GOAL] Gagal advance:', err?.message || err);
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
    console.warn('[GOAL] Gagal complete:', err?.message || err);
    return getGoal(id);
  }
}

export function abandonGoal(id: string): Goal | null {
  try {
    stmts(getDb()).updateStatus.run('abandoned', 0, Date.now(), id);
    return getGoal(id);
  } catch (err: any) {
    console.warn('[GOAL] Gagal abandon:', err?.message || err);
    return getGoal(id);
  }
}

/**
 * Dekomposisi rekursif: pecah goal menjadi subgoals.
 */
export function decomposeGoal(id: string, subgoals: { title: string; description?: string }[]): Goal[] {
  const created: Goal[] = [];
  for (const sg of subgoals) {
    const g = createGoal({ title: sg.title, description: sg.description, category: getGoal(id)?.category, parentId: id });
    if (g) created.push(g);
  }
  recomputeGoal(id);
  return created;
}

/**
 * Goal fokus untuk siklus saat ini: prioritas in_progress (paling baru),
 * lalu active paling tua yang belum punya progress dan masih relevan.
 */
export function getFocusGoal(now: number = Date.now()): Goal | null {
  const active = listActiveGoals(50);
  if (active.length === 0) return null;
  const fresh = active.filter((g) => (now - g.updated_at) < 24 * 60 * 60 * 1000);
  const pool = fresh.length > 0 ? fresh : active;
  const prioritized = [...pool].sort((a, b) => {
    const aScore = (a.status === 'in_progress' ? 1 : 0) + (now - a.updated_at) / 1000 / 1e6;
    const bScore = (b.status === 'in_progress' ? 1 : 0) + (now - b.updated_at) / 1000 / 1e6;
    return bScore - aScore;
  });
  return prioritized[0] || null;
}

/**
 * Bangun blok direktif trilingual untuk goal fokus.
 */
export function buildGoalDirective(goal: Goal): string {
  const children = getGoalChildren(goal.id);
  const childLines = children.length > 0
    ? children.map((c: Goal) => `  - ${c.status === 'completed' ? '[x]' : '[ ]'} (${Math.round(c.progress * 100)}%) ${c.title}`).join('\n')
    : '  - (sub-goal belum didekomposisi)';
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
