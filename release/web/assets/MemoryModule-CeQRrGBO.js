import{i as M,M as b,L as E}from"./index-CxwquvKK.js";import"better-sqlite3";import"path";import"fs";import"smol-toml";import"node:fs";import"node:path";import"node:url";import"node:module";import"fast-glob";import"url";async function v(n,p=5,o){const r=(n||"").trim().replace(/[^a-zA-Z0-9\s]/g," ").split(/\s+/).filter(t=>t.length>2).join(" OR ");if(!r)return[];try{const t=M();let a=`
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
    `;const i=[r],m=t.prepare(a).all(...i);if(m.length===0)return[];const s=Date.now(),l=m.map(e=>{const c=e.content||"",d=e.tags?JSON.parse(e.tags):[],y=e.bm25_score||1,g=typeof e.importance=="number"?e.importance:.5,u=e.timestamp?(s-e.timestamp)/36e5:9999,f=Math.max(0,1-u/720),h=y*(1+g)*(1+f*.5);return{id:e.id,content:c,tags:d,type:e.type,timestamp:e.timestamp,speaker:e.speaker,score:h}});return l.sort((e,c)=>c.score-e.score),l.slice(0,p)}catch(t){return console.error("[DATABASE:MemorySearch] FTS5 hybrid search failed:",t.message),[]}}const _={metadata:{id:"memory-engine",name:"yui-memory: Pattern Retrieval",description:"Retrieves relevant past experiences based on input keywords and recognized patterns.",version:"1.3.0",type:b.CORTEX,order:4,phase:"PHASE 1: AGGREGATION"},run:async(n,p,o)=>{const r=o.memories||[],t=E.recognizePatterns(r.slice(-30)),a=t.map(s=>s.pattern),i=`${n} ${a.join(" ")}`;return{relevantMemories:(await v(i,5)).map(s=>({content:s.content,tags:s.tags})),observedPatterns:t.slice(0,3)}}};export{_ as MemoryModule};
