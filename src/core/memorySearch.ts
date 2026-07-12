import { StorageService } from '../drivers/storage';

export interface MemorySearchHit {
  id: string;
  content: string;
  tags: string[];
  type?: string;
  timestamp?: number;
  speaker?: string;
  score: number;
}

/**
 * Lightweight hybrid retrieval over Yuihime's persistent memory knowledge base.
 * Keyword/tag overlap ranking fused with importance and recency decay.
 * This is the local equivalent of a standard agent "file_search"/retrieval tool.
 */
export async function searchMemories(
  query: string,
  limit = 5,
  type?: string
): Promise<MemorySearchHit[]> {
  const all = await StorageService.getMemories();
  const q = (query || '').toLowerCase().trim();
  if (!q) return [];
  const qWords = q.split(/\s+/).filter(Boolean);
  if (!Array.isArray(all) || all.length === 0) return [];

  const hits: MemorySearchHit[] = [];
  for (const m of all) {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '');
    const tags = Array.isArray(m.tags) ? m.tags.map((t: any) => String(t).toLowerCase()) : [];
    const c = content.toLowerCase();

    let score = 0;
    for (const w of qWords) {
      if (w.length < 2) continue;
      if (c.includes(w)) score += 2;
      if (tags.some((t) => t.includes(w) || w.includes(t))) score += 3;
    }

    if (type && m.type && m.type !== type) score -= 1;
    if (score <= 0) continue;

    const ageHours = m.timestamp ? (Date.now() - m.timestamp) / 3600000 : 9999;
    const recency = Math.max(0, 1 - ageHours / (24 * 30));
    const importance = typeof m.importance === 'number' ? m.importance : 0.5;
    score = score * (1 + importance) * (1 + recency * 0.5);

    hits.push({
      id: m.id,
      content,
      tags,
      type: m.type,
      timestamp: m.timestamp,
      speaker: m.speaker,
      score
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
