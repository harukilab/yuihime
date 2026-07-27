import{a as m,S as y}from"./index-DPfz3ymB.js";class v{static async moderateChatBatch(e,g){if(!e||e.length===0)return{selectedMessage:null,contextSummary:"",action:"stay",reasoning:"No messages to process."};const h=await m.getAIConfig(),f=y.getModule("provider-selector");if(!f)return{selectedMessage:e[e.length-1],contextSummary:"Chat is moving rapidly.",action:"stay",reasoning:"AI Provider Selector missing."};const p=`You are the Live Chat Moderator for AI VTuber Yuihime. 
Your job is to analyze a rapid batch of chat messages from viewers and pick ONE message that is most relevant to the current live topic.
If ALL messages are off-topic, pick one that is safe to acknowledge, and instruct the VTuber to redirect the stream back to the topic.
Filter out spam, hate speech, toxicity, or complete nonsense.

CURRENT TOPIC: "${g||"General Chatting"}"

Output MUST be ONLY a valid JSON object, with no other text, preambles or explanations.
Format:
{
  "selectedMessageId": "string id or null",
  "contextSummary": "string",
  "action": "stay" | "redirect",
  "reasoning": "string"
}

Here are the messages:
${JSON.stringify(e)}`;try{let r=(await f.run(p,{},{config:{...h,isJson:!0}})).rawResult.trim(),s=r.indexOf("{"),c="";if(s!==-1){let t=0,l=!1,d=!1,u=-1;for(let n=s;n<r.length;n++){const a=r[n];if(d){d=!1;continue}if(a==="\\"){d=!0;continue}if(a==='"'){l=!l;continue}if(!l){if(a==="{")t++;else if(a==="}"&&(t--,t===0)){u=n;break}}}u!==-1&&(c=r.substring(s,u+1))}if(!c)throw new Error("No valid JSON object found in response");const o=JSON.parse(c);return{selectedMessage:e.find(t=>t.id===String(o.selectedMessageId))||null||e[e.length-1],contextSummary:o.contextSummary||"Viewers are chatting.",action:o.action==="redirect"?"redirect":"stay",reasoning:o.reasoning||"Picked based on relevance."}}catch(i){return console.error("Moderator failed to process batch",i),{selectedMessage:e[e.length-1],contextSummary:"Moderator offline. Showing latest.",action:"stay",reasoning:`Error parsing moderator output: ${i.message}`}}}}export{v as LiveModeratorModule};
