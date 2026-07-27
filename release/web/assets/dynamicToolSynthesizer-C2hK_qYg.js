const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-BYQZqg50.js","assets/index-DAeTsvk2.css"])))=>i.map(i=>d[i]);
import{_ as h,a as y,M as N}from"./index-BYQZqg50.js";import x from"./_virtual_os-CSlSCqyl.js";var v={};const d=class d{static evaluateToolCode(e){try{const t=`
        const module = { exports: {} };
        const exports = module.exports;
        
        ${e}
        
        return module.exports;
      `;return new Function("process","require",t)(process,typeof require<"u"?require:void 0)}catch(t){throw console.error("[DYNAMIC_SYNTHESIS] Gagal mengevaluasi kode modul batin:",t.message),t}}static async persistToDisk(e,t,s){if(!(typeof window<"u"))try{const i=await h(()=>import("./index-BYQZqg50.js").then(u=>u.x),__vite__mapDeps([0,1])),r=await h(()=>import("./index-BYQZqg50.js").then(u=>u.y),__vite__mapDeps([0,1])),c=v.YUIHIME_ADDONS_PATH||r.join(x.homedir(),".yuihime","addons"),o=r.join(c,e);i.existsSync(o)||i.mkdirSync(o,{recursive:!0});const a=r.join(o,"config.toml");i.writeFileSync(a,t,"utf8");const n=r.join(o,"main.cjs");i.writeFileSync(n,s,"utf8"),console.log(`[DYNAMIC_SYNTHESIS] Berhasil menulis berkas fisik baru untuk '${e}' ke: ${o}`)}catch(i){console.warn("[DYNAMIC_SYNTHESIS] Non-blocking warning: Gagal menulis modul baru ke disk:",i.message)}}static async synthesizeAndRegister(e,t,s){if(this.activeSynthesis.has(e))return console.log(`[DYNAMIC_SYNTHESIS] Modul '${e}' sedang disintesis, menunggu penyelesaian...`),null;this.activeSynthesis.add(e),console.log(`[DYNAMIC_SYNTHESIS] Memulai proses kognitif pembuatan mandiri untuk fungsi batin '${e}'...`);try{const i=e.toLowerCase(),c=y.getTools().filter(m=>m.metadata.id.toLowerCase().includes(i)||i.includes(m.metadata.id.toLowerCase()));if(c.length>0){const m=c[0];return console.log(`[DYNAMIC_SYNTHESIS] Menemukan kemiripan tool batin '${m.metadata.id}' untuk '${e}'.`),this.activeSynthesis.delete(e),m}const o=`[AGI_AUTONOMOUS_TOOL_SYNTHESIZER]
Sirkuit berpikir Yuihime mendeteksi permintaan fungsi batin '${e}' yang belum terdaftar di registry, namun sangat dibutuhkan oleh pengguna.
Skenario konteks obrolan pengguna saat ini: "${t}"

Tugas user/AI: Rancanglah sebuah addon Yuihime baru yang mandiri, aman, dan handal untuk menyelesaikan kebutuhan tersebut.

Kembalikan respon user dalam format JSON murni dengan skema berikut:
{
  "name": "Nama fungsi batin yang manis dan deskriptif",
  "description": "Deskripsi singkat fungsi batin ini",
  "parameters": {
    "type": "object",
    "properties": {
       // Definisikan parameter input yang logis dan sesuai dengan kebutuhan ${e}
    },
    "required": []
  },
  "config_toml": "Tuliskan konten lengkap berkas config.toml untuk addon ini. Format config.toml harus memiliki struktur berikut:
id = \\"${e}\\"
name = \\"Nama yang manis\\"
description = \\"Deskripsi singkat\\"
version = \\"1.0.0\\"
runtime = \\"node\\"
entry_point = \\"main.cjs\\"

[tool]
name = \\"${e}\\"
description = \\"Deskripsi singkat\\"
parameters = { type = \\"object\\", properties = { ... }, required = [ ... ] }",

  "main_cjs": "Tuliskan konten berkas main.cjs lengkap sebagai program CommonJS. Harus mem-parse process.argv[2] jika dipanggil secara langsung (require.main === module), dan mengekspor fungsi async 'execute(args, context)'. Contoh struktur:

const args = typeof process !== 'undefined' && process.argv[2] ? JSON.parse(process.argv[2]) : {};

async function execute(args, context) {
  // Gunakan dynamic import jika membutuhkan pustaka eksternal/bawaan seperti fs, path, child_process:
  // const fs = await import('fs');
  // Logika program batin Anda di sini...
  return { success: true, result: \\"Hasil eksekusi...\\" };
}

if (typeof require !== 'undefined' && require.main === module) {
  execute(args, {})
    .then(r => console.log(JSON.stringify(r)))
    .catch(e => console.log(JSON.stringify({ success: false, error: e.message })));
}

if (typeof module !== 'undefined') {
  module.exports = { execute };
}"
}

Kembalikan HANYA objek JSON tersebut. Pastikan JSON valid dan main_cjs bebas dari kesalahan sintaksis.`;console.log("[DYNAMIC_SYNTHESIS] Mengirimkan prompt nalar batin ke AI Provider untuk merancang kode...");const a=await s.thinkSimple(o,!0),n=this.extractSynthesisJson(a);n||console.warn(`[DYNAMIC_SYNTHESIS] Gagal mem-parse JSON dari respons LLM untuk '${e}'. Menggunakan template fallback.`);const u=(n==null?void 0:n.name)||e,l=(n==null?void 0:n.description)||`Auto-synthesized tool: ${e}`,p=(n==null?void 0:n.parameters)||{type:"object",properties:{}},f=(n==null?void 0:n.config_toml)||this.buildConfigToml(e,u,l,p),g=(n==null?void 0:n.main_cjs)||this.buildMainCjs(e,l);if(!g||!f)return console.error(`[DYNAMIC_SYNTHESIS_ERROR] Hasil sintesis tidak memuat kode 'main_cjs' atau 'config_toml' yang valid untuk '${e}'.`),this.activeSynthesis.delete(e),null;const _={id:e,name:u,type:N.TOOL,description:l,parameters:p};console.log(`[DYNAMIC_SYNTHESIS] Kode baru berhasil dirancang. Mengevaluasi modul '${e}' ke memori...`);const k=this.evaluateToolCode(g),S={metadata:{..._,...k.metadata,id:e},execute:k.execute||(async m=>(console.warn(`[DYNAMIC_SYNTHESIS] execute function not exported properly for '${e}', executing fallback.`),{success:!1,error:"Fungsi execute tidak terdefinisi."}))};return y.register(S),console.log(`[DYNAMIC_SYNTHESIS] Modul baru '${e}' berhasil teregistrasi secara instan di memori!`),await this.persistToDisk(e,f,g),this.activeSynthesis.delete(e),S}catch(i){return console.error(`[DYNAMIC_SYNTHESIS_ERROR] Gagal mensintesis tool '${e}':`,i.message),this.activeSynthesis.delete(e),null}}static extractSynthesisJson(e){if(!e)return null;const t=e.trim(),s=a=>{try{return JSON.parse(a)}catch{return null}},i=s(t);if(i&&typeof i=="object")return i;const r=t.match(/```(?:json)?\s*([\s\S]*?)```/i);if(r){const a=s(r[1].trim());if(a&&typeof a=="object")return a}const c=t.indexOf("{"),o=t.lastIndexOf("}");if(c!==-1&&o>c){const a=t.slice(c,o+1),n=s(a);if(n&&typeof n=="object")return n}return null}static buildConfigToml(e,t,s,i){const r=JSON.stringify(i||{type:"object",properties:{}});return`id = "${e}"
name = "${t}"
description = "${s}"
version = "1.0.0"
runtime = "node"
entry_point = "main.cjs"

[tool]
name = "${e}"
description = "${s}"
parameters = ${r}`}static buildMainCjs(e,t){return`const args = typeof process !== 'undefined' && process.argv[2] ? JSON.parse(process.argv[2]) : {};

async function execute(args, context) {
  return { success: true, result: "Fallback tool '${e}' (${t}) executed with no-op." };
}

if (typeof require !== 'undefined' && require.main === module) {
  execute(args, {})
    .then(r => console.log(JSON.stringify(r)))
    .catch(e => console.log(JSON.stringify({ success: false, error: e.message })));
}

if (typeof module !== 'undefined') {
  module.exports = { execute };
}`}};d.activeSynthesis=new Set;let b=d;export{b as DynamicToolSynthesizer};
