import { extractJsonObject } from './jsonExtract.js';
import { isolateBraceBlock } from './jsonRepairer.js';
import { SystemRegistry } from '@shared/core/registry';
import { ModuleType } from '@shared/include/types';
import os from "os";
import path from "path";
import fs from "fs";

/**
 * Dynamic Tool Synthesizer:
 * Inovasi AGI Yuihime yang mendeteksi tool calling yang tidak terdaftar (Tool Not Found),
 * lalu secara cerdas mencari cara alternatif atau mensintesis (menulis) kode module tool
 * baru secara mandiri di background, menyimpannya ke berkas fisik di .yuihime/addons/ untuk persistensi,
 * serta meregistrasikannya secara instan di memori sistem agar bisa langsung dijalankan.
 */
export class DynamicToolSynthesizer {
  private static activeSynthesis = new Set<string>();

  /**
   * Mengevaluasi kode CommonJS main.cjs dari LLM menjadi objek module yang bisa dieksekusi di memori.
   */
  private static evaluateToolCode(codeString: string): any {
    try {
      const cleanCode = `
        const module = { exports: {} };
        const exports = module.exports;
        
        ${codeString}
        
        return module.exports;
      `;
      // Buat function wrapper untuk mengevaluasi kode CommonJS
      const evaluator = new Function('process', 'require', cleanCode);
      return evaluator(process, typeof require !== 'undefined' ? require : undefined);
    } catch (evalErr: any) {
      console.error('[DYNAMIC_SYNTHESIS] Gagal mengevaluasi kode modul batin:', evalErr.message);
      throw evalErr;
    }
  }

  /**
   * Melakukan persistensi berkas ke dalam direktori .yuihime/addons/ fisik jika berada di sisi server.
   */
  private static async persistToDisk(toolId: string, configToml: string, mainCjs: string) {
    if (typeof window !== 'undefined') return;

    try {
      const addonsDir = process.env.YUIHIME_ADDONS_PATH || path.join(os.homedir(), ".yuihime", "addons");
      const addonDir = path.join(addonsDir, toolId);
      
      if (!fs.existsSync(addonDir)) {
        fs.mkdirSync(addonDir, { recursive: true });
      }

      // Tulis berkas config.toml
      const configPath = path.join(addonDir, 'config.toml');
      fs.writeFileSync(configPath, configToml, 'utf8');

      // Tulis berkas main.cjs
      const mainPath = path.join(addonDir, 'main.cjs');
      fs.writeFileSync(mainPath, mainCjs, 'utf8');

      console.log(`[DYNAMIC_SYNTHESIS] Berhasil menulis berkas fisik baru untuk '${toolId}' ke: ${addonDir}`);
    } catch (writeErr: any) {
      console.warn('[DYNAMIC_SYNTHESIS] Non-blocking warning: Gagal menulis modul baru ke disk:', writeErr.message);
    }
  }

  /**
   * Melakukan analisis, pencarian solusi alternatif, atau mensintesis tool baru secara otomatis.
   */
  public static async synthesizeAndRegister(
    toolId: string,
    currentInput: string,
    cortexInstance: any
  ): Promise<any> {
    if (this.activeSynthesis.has(toolId)) {
      console.log(`[DYNAMIC_SYNTHESIS] Modul '${toolId}' sedang disintesis, menunggu penyelesaian...`);
      return null;
    }

    this.activeSynthesis.add(toolId);
    console.log(`[DYNAMIC_SYNTHESIS] Memulai proses kognitif pembuatan mandiri untuk fungsi batin '${toolId}'...`);

    try {
      // 1. CARI CARA DULU: Cek apakah ada penyesuaian alias atau tool eksis yang bisa dipakai
      const lowerId = toolId.toLowerCase();
      const existingTools = SystemRegistry.getTools();
      
      // Jika ada kemiripan nama yang sangat kuat, kita coba hubungkan (fuzzy matching)
      const matches = existingTools.filter(t => 
        t.metadata.id.toLowerCase().includes(lowerId) || 
        lowerId.includes(t.metadata.id.toLowerCase())
      );
      if (matches.length > 0) {
        const bestMatch = matches[0];
        console.log(`[DYNAMIC_SYNTHESIS] Menemukan kemiripan tool batin '${bestMatch.metadata.id}' untuk '${toolId}'.`);
        this.activeSynthesis.delete(toolId);
        return bestMatch;
      }

      // 2. BUAT TOOLS MANDIRI DI BACKGROUND: Sintesis kode via LLM
      const prompt = `[AGI_AUTONOMOUS_TOOL_SYNTHESIZER]
Sirkuit berpikir Yuihime mendeteksi permintaan fungsi batin '${toolId}' yang belum terdaftar di registry, namun sangat dibutuhkan oleh pengguna.
Skenario konteks obrolan pengguna saat ini: "${currentInput}"

Tugas user/AI: Rancanglah sebuah addon Yuihime baru yang mandiri, aman, dan handal untuk menyelesaikan kebutuhan tersebut.

Kembalikan respon user dalam format JSON murni dengan skema berikut:
{
  "name": "Nama fungsi batin yang manis dan deskriptif",
  "description": "Deskripsi singkat fungsi batin ini",
  "parameters": {
    "type": "object",
    "properties": {
       // Definisikan parameter input yang logis dan sesuai dengan kebutuhan ${toolId}
    },
    "required": []
  },
  "config_toml": "Tuliskan konten lengkap berkas config.toml untuk addon ini. Format config.toml harus memiliki struktur berikut:
id = \\"${toolId}\\"
name = \\"Nama yang manis\\"
description = \\"Deskripsi singkat\\"
version = \\"1.0.0\\"
runtime = \\"node\\"
entry_point = \\"main.cjs\\"

[tool]
name = \\"${toolId}\\"
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

Kembalikan HANYA objek JSON tersebut. Pastikan JSON valid dan main_cjs bebas dari kesalahan sintaksis.`;

      console.log(`[DYNAMIC_SYNTHESIS] Mengirimkan prompt nalar batin ke AI Provider untuk merancang kode...`);
      const rawResponse = await cortexInstance.thinkSimple(prompt, true);

      const parsedResponse = this.extractSynthesisJson(rawResponse);
      if (!parsedResponse) {
        console.warn(`[DYNAMIC_SYNTHESIS] Gagal mem-parse JSON dari respons LLM untuk '${toolId}'. Menggunakan template fallback.`);
      }

      const name = parsedResponse?.name || toolId;
      const description = parsedResponse?.description || `Auto-synthesized tool: ${toolId}`;
      const parameters = parsedResponse?.parameters || { type: 'object', properties: {} };
      const config_toml = parsedResponse?.config_toml || this.buildConfigToml(toolId, name, description, parameters);
      const main_cjs = parsedResponse?.main_cjs || this.buildMainCjs(toolId, description);

      if (!main_cjs || !config_toml) {
        console.error(`[DYNAMIC_SYNTHESIS_ERROR] Hasil sintesis tidak memuat kode 'main_cjs' atau 'config_toml' yang valid untuk '${toolId}'.`);
        this.activeSynthesis.delete(toolId);
        return null;
      }

      const metadata = {
        id: toolId,
        name,
        type: ModuleType.TOOL,
        description,
        parameters
      };

      console.log(`[DYNAMIC_SYNTHESIS] Kode baru berhasil dirancang. Mengevaluasi modul '${toolId}' ke memori...`);
      
      // Evaluasi dan jalankan kompilasi in-memory
      const evaluated = this.evaluateToolCode(main_cjs);
      
      const newToolModule = {
        metadata: {
          ...metadata,
          ...evaluated.metadata,
          id: toolId // Kunci agar ID konsisten
        },
        execute: evaluated.execute || (async (args: any) => {
          console.warn(`[DYNAMIC_SYNTHESIS] execute function not exported properly for '${toolId}', executing fallback.`);
          return { success: false, error: "Fungsi execute tidak terdefinisi." };
        })
      };

      // Daftarkan secara instan ke dalam memori SystemRegistry
      SystemRegistry.register(newToolModule);
      console.log(`[DYNAMIC_SYNTHESIS] Modul baru '${toolId}' berhasil teregistrasi secara instan di memori!`);

      // Persistensi ke dalam berkas fisik di .yuihime/addons agar terus tersimpan
      await this.persistToDisk(toolId, config_toml, main_cjs);

      this.activeSynthesis.delete(toolId);
      return newToolModule;
    } catch (err: any) {
      console.error(`[DYNAMIC_SYNTHESIS_ERROR] Gagal mensintesis tool '${toolId}':`, err.message);
      this.activeSynthesis.delete(toolId);
      return null;
    }
  }

  /**
   * Ekstrak objek JSON dari respons LLM yang mungkin mengandung teks penjelasan
   * atau dibungkus dalam markdown code block (```json ... ```).
   */
  private static extractSynthesisJson(raw: string): any | null {
    if (!raw) return null;
    const text = raw.trim();

    const tryParse = (s: string): any | null => {
      try {
        const match = extractJsonObject(s);
        const target = match ? match : s;
        return JSON.parse(target);
      } catch {
        return null;
      }
    };

    const direct = tryParse(text);
    if (direct && typeof direct === 'object') return direct;

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      const parsed = tryParse(fenced[1].trim());
      if (parsed && typeof parsed === 'object') return parsed;
    }

    const isolated = isolateBraceBlock(text);
    if (isolated !== text) {
      const parsed = tryParse(isolated);
      if (parsed && typeof parsed === 'object') return parsed;
    }

    return null;
  }

  /**
   * Template config.toml fallback jika LLM tidak mengembalikan field tersebut.
   */
  private static buildConfigToml(toolId: string, name: string, description: string, parameters: any): string {
    const params = JSON.stringify(parameters || { type: 'object', properties: {} });
    return `id = "${toolId}"
name = "${name}"
description = "${description}"
version = "1.0.0"
runtime = "node"
entry_point = "main.cjs"

[tool]
name = "${toolId}"
description = "${description}"
parameters = ${params}`;
  }

  /**
   * Template main.cjs fallback jika LLM tidak mengembalikan field tersebut.
   */
  private static buildMainCjs(toolId: string, description: string): string {
    return `const args = typeof process !== 'undefined' && process.argv[2] ? JSON.parse(process.argv[2]) : {};

async function execute(args, context) {
  return { success: true, result: "Fallback tool '${toolId}' (${description}) executed with no-op." };
}

if (typeof require !== 'undefined' && require.main === module) {
  execute(args, {})
    .then(r => console.log(JSON.stringify(r)))
    .catch(e => console.log(JSON.stringify({ success: false, error: e.message })));
}

if (typeof module !== 'undefined') {
  module.exports = { execute };
}`;
  }
}
