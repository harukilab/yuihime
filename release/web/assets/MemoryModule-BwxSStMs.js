import{M,L as b}from"./index-BYQZqg50.js";import{i as E}from"./database-CqNJ1wwC.js";import"./_virtual_better-sqlite3-Cw-mQr1H.js";import"./_virtual_os-CSlSCqyl.js";async function v(r,p=5,a){const n=(r||"").trim().replace(/[^a-zA-Z0-9\s]/g," ").split(/\s+/).filter(t=>t.length>2).join(" OR ");if(!n)return[];try{const t=E();let o=`
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
    `;const i=[n],m=t.prepare(o).all(...i);if(m.length===0)return[];const s=Date.now(),l=m.map(e=>{const c=e.content||"",d=e.tags?JSON.parse(e.tags):[],y=e.bm25_score||1,g=typeof e.importance=="number"?e.importance:.5,u=e.timestamp?(s-e.timestamp)/36e5:9999,f=Math.max(0,1-u/720),h=y*(1+g)*(1+f*.5);return{id:e.id,content:c,tags:d,type:e.type,timestamp:e.timestamp,speaker:e.speaker,score:h}});return l.sort((e,c)=>c.score-e.score),l.slice(0,p)}catch(t){return console.error("[DATABASE:MemorySearch] FTS5 hybrid search failed:",t.message),[]}}const H={metadata:{id:"memory-engine",name:"yui-memory: Pattern Retrieval",description:"Retrieves relevant past experiences based on input keywords and recognized patterns.",version:"1.3.0",type:M.CORTEX,order:4,phase:"PHASE 1: AGGREGATION"},run:async(r,p,a)=>{const n=a.memories||[],t=b.recognizePatterns(n.slice(-30)),o=t.map(s=>s.pattern),i=`${r} ${o.join(" ")}`;return{relevantMemories:(await v(i,5)).map(s=>({content:s.content,tags:s.tags})),observedPatterns:t.slice(0,3)}}};export{H as MemoryModule};
