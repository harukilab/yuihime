import{M,P as l}from"./index-BYQZqg50.js";const c=`
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
`.trim();l.getInstance().register("memory-consolidation:main",c);const S={metadata:{id:"memory-consolidation",name:"yui-synapse: Memory Consolidator",description:"Consolidates recent interactive memories into symbolic dreams for long-term schema formation.",version:"1.0.0",type:M.CORTEX,order:100,phase:"LOGIC",configSchema:{fields:{enabled:{type:"boolean",label:"Enabled",default:!0},memoryThreshold:{type:"number",label:"Memory Threshold",default:5},maxMemories:{type:"number",label:"Max Memories per Cycle",default:20},promptTemplate:{type:"textarea",label:"Consolidation Prompt Template",default:c,description:"The prompt used to consolidate memories. Use ${memoryList} as variable."}}}},run:async(m,f,e)=>{if(m!=="CONSOLIDATE_MEMORIES"&&m!=="[SYSTEM_SIGNAL]: Memory Consolidation triggered.")return{...e};const{enabled:d=!0,maxMemories:p=20,promptTemplate:y}=e.moduleConfig||{};if(!d)return{...e};console.log("[KERNEL] Consolidating memories into dreams...");try{const o=e.think,n=e.db;if(!o)return console.warn("[MEMORY_CONSOLIDATOR] No think function in context. Bypassing consolidation."),{...e};if(!n)return console.warn("[MEMORY_CONSOLIDATOR] No database access in context."),{...e};const r=n.prepare("SELECT id, content FROM memories ORDER BY timestamp DESC LIMIT ?").all(p);if(r.length<5)return{...e,consolidationNote:"Insufficient memories for consolidation."};const s=l.getInstance(),g=y||s.get("memory-consolidation:main");s.register("memory-consolidation:main",g,!0);const u=s.compile("memory-consolidation:main",{memoryList:r.map(a=>`- ${a.content}`).join(`
`)}),O=await o(u,!0),t=JSON.parse(O),i=Math.random().toString(36).substr(2,9);return n.prepare(`
        INSERT INTO dreams (id, concept, abstractions, strength, lastReinforced, underlyingMemories)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(i,t.concept,JSON.stringify(t.abstractions||[]),t.strength||.5,Date.now(),JSON.stringify(r.map(a=>a.id))),console.log(`[CONSOLIDATOR] Neural schema persisted: ${i}`),{...e,lastConsolidationId:i,logs:[...e.logs||[],`[SYSTEM] Memory consolidation completed: ${t.concept}`]}}catch(o){return console.error("[CONSOLIDATOR] Memory consolidation failed:",o),e}}};export{S as MemoryConsolidationModule};
