import{M,P as l}from"./index-CxwquvKK.js";import"better-sqlite3";import"path";import"fs";import"smol-toml";import"node:fs";import"node:path";import"node:url";import"node:module";import"fast-glob";import"url";const c=`
Analyze these recent interactive memories of AI agent "Yuihime" and consolidate them into a singular "Dream" segment.
A dream is a symbolic, compressed representation of experiences that helps the agent derive long-term schemas.

Memories:
\${memoryList}

Respond in JSON:
{
  "concept": "A core title or concept for this dream session",
  "abstractions": ["key takeaway 1", "key takeaway 2"],
  "strength": 0.8
}
`.trim();l.getInstance().register("memory-consolidation:main",c);const D={metadata:{id:"memory-consolidation",name:"yui-synapse: Memory Consolidator",description:"Consolidates recent interactive memories into symbolic dreams for long-term schema formation.",version:"1.0.0",type:M.CORTEX,order:100,phase:"LOGIC",configSchema:{fields:{enabled:{type:"boolean",label:"Enabled",default:!0},memoryThreshold:{type:"number",label:"Memory Threshold",default:5},maxMemories:{type:"number",label:"Max Memories per Cycle",default:20},promptTemplate:{type:"textarea",label:"Consolidation Prompt Template",default:c,description:"The prompt used to consolidate memories. Use ${memoryList} as variable."}}}},run:async(m,f,e)=>{if(m!=="CONSOLIDATE_MEMORIES"&&m!=="[SYSTEM_SIGNAL]: Memory Consolidation triggered.")return{...e};const{enabled:d=!0,maxMemories:p=20,promptTemplate:y}=e.moduleConfig||{};if(!d)return{...e};console.log("[KERNEL] Consolidating memories into dreams...");try{const o=e.think,r=e.db;if(!o)return console.warn("[MEMORY_CONSOLIDATOR] No think function in context. Bypassing consolidation."),{...e};if(!r)return console.warn("[MEMORY_CONSOLIDATOR] No database access in context."),{...e};const n=r.prepare("SELECT id, content FROM memories ORDER BY timestamp DESC LIMIT ?").all(p);if(n.length<5)return{...e,consolidationNote:"Insufficient memories for consolidation."};const i=l.getInstance(),g=y||i.get("memory-consolidation:main");i.register("memory-consolidation:main",g,!0);const u=i.compile("memory-consolidation:main",{memoryList:n.map(a=>`- ${a.content}`).join(`
`)}),O=await o(u,!0),t=JSON.parse(O),s=Math.random().toString(36).substr(2,9);return r.prepare(`
        INSERT INTO dreams (id, concept, abstractions, strength, lastReinforced, underlyingMemories)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(s,t.concept,JSON.stringify(t.abstractions||[]),t.strength||.5,Date.now(),JSON.stringify(n.map(a=>a.id))),console.log(`[CONSOLIDATOR] Neural schema persisted: ${s}`),{...e,lastConsolidationId:s,logs:[...e.logs||[],`[SYSTEM] Memory consolidation completed: ${t.concept}`]}}catch(o){return console.error("[CONSOLIDATOR] Memory consolidation failed:",o),e}}};export{D as MemoryConsolidationModule};
