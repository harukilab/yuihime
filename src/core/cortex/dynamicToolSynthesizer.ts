import { SystemRegistry } from '../registry';
import { ModuleType } from '../../include/types';

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
      const fs = await import('fs');
      const path = await import('path');

      const addonsDir = process.env.YUIHIME_ADDONS_PATH || path.join(process.cwd(), '.yuihime', 'addons');
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

Tugas Kakak/AI: Rancanglah sebuah addon Yuihime baru yang mandiri, aman, dan handal untuk menyelesaikan kebutuhan tersebut.

Kembalikan respon Kakak dalam format JSON murni dengan skema berikut:
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
      
      let parsedResponse: any;
      try {
        parsedResponse = JSON.parse(rawResponse.trim());
      } catch (pErr) {
        // Coba perbaiki format jika ada markdown block
        const cleaned = rawResponse.replace(/```json/gi, '').replace(/```/gi, '').trim();
        parsedResponse = JSON.parse(cleaned);
      }

      if (!parsedResponse.main_cjs || !parsedResponse.config_toml) {
        throw new Error("Hasil sintesis tidak memuat kode 'main_cjs' atau 'config_toml' yang valid.");
      }

      const metadata = {
        id: toolId,
        name: parsedResponse.name || toolId,
        type: ModuleType.TOOL,
        description: parsedResponse.description || 'Autogenerated by Yuihime AGI',
        parameters: parsedResponse.parameters || { type: 'object', properties: {} }
      };

      console.log(`[DYNAMIC_SYNTHESIS] Kode baru berhasil dirancang. Mengevaluasi modul '${toolId}' ke memori...`);
      
      // Evaluasi dan jalankan kompilasi in-memory
      const evaluated = this.evaluateToolCode(parsedResponse.main_cjs);
      
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
      await this.persistToDisk(toolId, parsedResponse.config_toml, parsedResponse.main_cjs);

      this.activeSynthesis.delete(toolId);
      return newToolModule;
    } catch (err: any) {
      console.error(`[DYNAMIC_SYNTHESIS_ERROR] Gagal mensintesis tool '${toolId}':`, err.message);
      this.activeSynthesis.delete(toolId);
      return null;
    }
  }
}
