import { initializeDatabase } from './database.js';

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
 * Robust hybrid retrieval over Yuihime's persistent memory knowledge base.
 * Combines SQLite FTS5 BM25 keyword matching with importance and recency decay.
 */
export async function searchMemories(
  query: string,
  limit = 5,
  type?: string
): Promise<MemorySearchHit[]> {
  const cleanQuery = (query || '')
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, ' ') // sanitize special characters for FTS5 safety
    .split(/\s+/)
    .filter(w => w.length > 2)
    .join(' OR ');

  if (!cleanQuery) return [];

  try {
    const db = initializeDatabase();
    
    // We construct a query fetching matching FTS5 documents joined back to memories
    // to apply importance and recency decay inside the SQL scoring logic.
    let sql = `
      SELECT 
        m.id, 
        m.content, 
        m.tags, 
        m.type, 
        m.timestamp, 
        m.speaker,
        m.importance,
        (fts.rank * -1) as bm25_score
      FROM memories_fts fts
      JOIN memories m ON m.id = fts.id
      WHERE memories_fts MATCH ?
    `;
    const params: any[] = [cleanQuery];

    if (type) {
      sql += " AND m.type = ?";
      params.push(type);
    }

    const rows = db.prepare(sql).all(...params) as any[];
    if (rows.length === 0) return [];

    const now = Date.now();
    const hits: MemorySearchHit[] = rows.map((r: any) => {
      const content = r.content || '';
      const tags = r.tags ? JSON.parse(r.tags) : [];
      const bm25 = r.bm25_score || 1.0;
      const importance = typeof r.importance === 'number' ? r.importance : 0.5;

      const ageHours = r.timestamp ? (now - r.timestamp) / 3600000 : 9999;
      const recency = Math.max(0, 1 - ageHours / (24 * 30)); // 30 days decay window

      // Calculate final composite score
      const score = bm25 * (1 + importance) * (1 + recency * 0.5);

      return {
        id: r.id,
        content,
        tags,
        type: r.type,
        timestamp: r.timestamp,
        speaker: r.speaker,
        score
      };
    });

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  } catch (e: any) {
    console.error("[DATABASE:MemorySearch] FTS5 hybrid search failed:", e.message);
    return [];
  }
}
