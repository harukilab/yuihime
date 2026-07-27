import{a as y,M as S}from"./index-BGrh6Zsf.js";import{S as N}from"./processor-xIyaAIyt.js";import{i as I}from"./database-DGUpS8en.js";import"./settings-CnJgBnb6.js";import"./configNormalizer-DWeHtIdz.js";import"./_virtual_better-sqlite3-Cw-mQr1H.js";import"./_virtual_path-b7eebFBy.js";import"./_virtual_fs-Dvvh2TLP.js";import"./_virtual_os-CSlSCqyl.js";class M{static async optimize(c,m,r){var i,o;console.log("[LEARNING_ENGINE] Starting optimization cycle...");const n=await y.getPerformanceSummary(),t=await y.getStrategies(),s=((o=(i=c.getConfig())==null?void 0:i.agent)==null?void 0:o.learningMemoryLimit)||15,l=m.filter(e=>e.tags.includes("api")||e.tags.includes("error")||e.importance>.8).slice(-s),p=`
      As Yuihime's Cognitive Learning System, your task is to distill behavioral and technical heuristics from historical data.
      
      CURRENT STATE:
      Emotions: ${JSON.stringify(r.mood)}
      System Health: ${JSON.stringify(n)}
      
      RECENT RELEVANT MEMORIES:
      ${l.map(e=>`- [${e.type}] ${e.content}`).join(`
`)}
      
      EXISTING STRATEGIES:
      ${t.map(e=>`- ${e.topic}: ${e.instruction} (Confidence: ${e.confidence})`).join(`
`)}
      
      GOAL:
      Analyze failures and patterns. Create strategies for retry logic, emotional tone, or specific user preferences.
      
      CRITICAL: Return ONLY a raw JSON array. 
      DO NOT include markdown code blocks (\`\`\`json).
      DO NOT include bullet points (*).
      DO NOT include any explanation or preamble.
      
      Format: [{ "topic": "STRING", "instruction": "STRATEGIC_REFINEMENT", "confidence": 0.8, "successCount": 0, "failureCount": 0 }]
    `;try{const e=await c.thinkSimple(p,!0),a=N.parseLLMResponse(e,[]);if(a.length===0)return console.warn("[LEARNING_ENGINE] No valid JSON array found or empty array in response:",e.substring(0,100)),t;let d=t;return Array.isArray(a)&&(d=a.map(u=>{const f=t.find(E=>E.topic===u.topic);return f?{...f,instruction:u.instruction,confidence:(f.confidence+u.confidence)/2,lastOptimized:Date.now()}:{...u,id:Math.random().toString(36).substr(2,9),lastOptimized:Date.now()}})),await y.saveStrategies(d),d}catch(e){return console.error("[LEARNING_ENGINE] Optimization failed:",e),t}}static async extractKnowledge(c,m,r){var l,p;console.log("[LEARNING_ENGINE] Extracting knowledge from memories...");const n=((p=(l=c.getConfig())==null?void 0:l.agent)==null?void 0:p.knowledgeMemoryLimit)||50,s=`
      Extract factual knowledge about the world, the user, or Yuihime's identity from these memories.
      
      MEMORIES:
      ${m.slice(-n).map(i=>`[ID: ${i.id}] ${i.content}`).join(`
`)}
      
      EXISTING KNOWLEDGE:
      ${r.map(i=>`- ${i.topic}: ${i.content}`).join(`
`)}
      
      CRITICAL: Return ONLY a raw JSON array. DO NOT include markdown code blocks, explanation, or any text before/after the JSON.
      Format: [{ "topic": "User Preference", "content": "Likes digital art", "confidence": 0.9, "sourceMemoryIds": ["m1", "m2"] }]
    `;try{const i=await c.thinkSimple(s,!0),o=N.parseLLMResponse(i,[]);if(o.length===0)return console.warn("[LEARNING_ENGINE] No valid JSON array found in extraction response:",i.substring(0,100)),r;const e=[...r];return Array.isArray(o)&&o.forEach(a=>{const d=e.findIndex(u=>u.topic.toLowerCase()===a.topic.toLowerCase());d!==-1?e[d]={...e[d],content:a.content,confidence:(e[d].confidence+a.confidence)/2,updatedAt:Date.now(),sourceMemoryIds:Array.from(new Set([...e[d].sourceMemoryIds,...a.sourceMemoryIds||[]]))}:e.push({id:Math.random().toString(36).substr(2,9),topic:a.topic,content:a.content,confidence:a.confidence,sourceMemoryIds:a.sourceMemoryIds||[],updatedAt:Date.now()})}),e}catch(i){return console.error("[LEARNING_ENGINE] Knowledge extraction failed:",i),r}}static recognizePatterns(c){const m=c.map(t=>t.content.toLowerCase()).join(" "),r={};return["error","failed","help","thanks","cool","bad","great","wow","again"].forEach(t=>{const s=(m.match(new RegExp(t,"g"))||[]).length;s>0&&(r[t]=s)}),Object.entries(r).map(([t,s])=>({pattern:t,frequency:s,type:["error","failed","bad"].includes(t)?"negative":"positive"})).sort((t,s)=>s.frequency-t.frequency)}static async reinforce(c,m){const r=await y.getStrategies(),n=r.find(t=>t.topic===c);n&&(m?(n.successCount++,n.confidence=Math.min(1,n.confidence+.05)):(n.failureCount++,n.confidence=Math.max(0,n.confidence-.1)),await y.saveStrategies(r))}}async function O(g,c=5,m){const r=(g||"").trim().replace(/[^a-zA-Z0-9\s]/g," ").split(/\s+/).filter(n=>n.length>2).join(" OR ");if(!r)return[];try{const n=I();let t=`
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
    `;const s=[r],l=n.prepare(t).all(...s);if(l.length===0)return[];const p=Date.now(),i=l.map(o=>{const e=o.content||"",a=o.tags?JSON.parse(o.tags):[],d=o.bm25_score||1,u=typeof o.importance=="number"?o.importance:.5,f=o.timestamp?(p-o.timestamp)/36e5:9999,E=Math.max(0,1-f/720),h=d*(1+u)*(1+E*.5);return{id:o.id,content:e,tags:a,type:o.type,timestamp:o.timestamp,speaker:o.speaker,score:h}});return i.sort((o,e)=>e.score-o.score),i.slice(0,c)}catch(n){return console.error("[DATABASE:MemorySearch] FTS5 hybrid search failed:",n.message),[]}}const v={metadata:{id:"memory-engine",name:"yui-memory: Pattern Retrieval",description:"Retrieves relevant past experiences based on input keywords and recognized patterns.",version:"1.3.0",type:S.CORTEX,order:4,phase:"PHASE 1: AGGREGATION"},run:async(g,c,m)=>{const r=m.memories||[],n=M.recognizePatterns(r.slice(-30)),t=n.map(p=>p.pattern),s=`${g} ${t.join(" ")}`;return{relevantMemories:(await O(s,5)).map(p=>({content:p.content,tags:p.tags})),observedPatterns:n.slice(0,3)}}};export{v as MemoryModule};
