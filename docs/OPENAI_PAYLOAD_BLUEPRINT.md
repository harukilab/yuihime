# OpenAI Payload Alignment Blueprint & SOP
Version: 1.0.0
Author: Cognitive Kernel Architecture (Yuihime)

---

## 1. Pendahuluan
Berkas cetak biru ini bertujuan untuk mensubstansiasi kerangka kerja standar pembuatan payload (HTTP Request dan Response) untuk seluruh model bahasa penyedia (LLM Providers) yang terintegrasi di dalam Yuihime. 

Semua driver (`src/drivers/ai-providers/*`), cortex router (`src/core/cortex.ts`), dan server AI gateway (`src/core/kernel/ai/*`) dan perkakas bantu lainnya **WAJIB** merujuk, patuh, dan mengimplementasikan format standar ini untuk menjamin kestabilan proses translasi kognisi batin Yuihime tanpa risiko kerusakan struktur JSON/XML (*JSON/XML parser corruptions*).

---

## 2. Struktur Payload Request Standar (OpenAI Standard Schema)
Payload yang dikirimkan menuju gerbang LLM harus mematuhi skema JSON OpenAI murni dengan parameter-parameter yang dikelompokkan secara logis:

```json
{
  "model": "string (ID Model Aktif asli dari Provider)",
  "messages": [
    {
      "role": "system",
      "content": "Instruksi sistem / Kepribadian batin / Direktori sistem (System Instructions)"
    },
    {
      "role": "user",
      "content": "Pesan masukan dari pengguna / konteks memori batin / lampiran teks"
    }
  ],
  "temperature": 0.7,
  "top_p": 0.95,
  "max_tokens": 65536,
  "response_format": {
    "type": "json_object"
  },
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "nama_fungsi_alat",
        "description": "Deskripsi kegunaan alat agar dipahami oleh LLM",
        "parameters": {
          "type": "object",
          "properties": {
            "parameter_1": {
              "type": "string",
              "description": "Deskripsi fungsional parameter 1"
            }
          },
          "required": ["parameter_1"]
        }
      }
    }
  ]
}
```

### Protokol Peran Pesan Standar (Message Role Mapping Protocol)
Untuk menstandarkan sirkuit kognitif, payload kognisi batin menyepakati klasifikasi 3 peran utama berikut dengan aturan ketat:

1. **`system` (System Instructions / Core Directives)**:
   - **Tanggung Jawab**: Mendefinisikan batiniah dasar, kepribadian (Yuihime), instruksi format JSON murni, dan petunjuk sensitifitas emosional.
   - **Aturan Payload**: Selalu diletakkan di indeks berurutan terdepan (`messages[0]`). Tidak boleh dicampur aduk dengan riwayat chat dinamis. Di tingkat driver nondestruktif (seperti Claude/Anthropic), komponen ini diekstrak murni sebagai parameter `"system"`.

2. **`user` (User Messages & Ambient Memory Context)**:
   - **Tanggung Jawab**: Menampung pesan langsung dari pengguna (subjek), dipasangkan dengan ingatan kontekstual (Memories) hasil pencarian Dynamic Hybrid Vector & FTS5.
   - **Aturan Payload**: Harus berpasangan secara kronologis dengan respons sebelumnya. Untuk model interaksi tertentu, jika terdapat multi-turn berurutan dari pengguna, mereka wajib diringkas atau digabungkan ke dalam satu kontainer `content` tunggal bertipe `user` untuk mencegah pemangkasan atau crash struktur pada antarmuka LLM tertentu yang sensitif seperti Claude.

3. **`agent` / `assistant` (Agent Speech / Simulated Cognitive Responses)**:
   - **Tanggung Jawab**: Representasi dari ucapan batin dan respons kognitif yang diproduksi oleh Yuihime dalam giliran/fase sebelumnya.
   - **Aturan Payload**: Di dalam representasi internal atau status visual client, peran ini dapat dinamakan `agent`. Namun, **WAJIB HUKUMNYA** saat payload ditranslasikan dalam rute transmisi kognitif (`src/drivers/ai-providers/*`), kata kunci peran `agent` dirubah secara mutlak berkekuatan hukum menjadi **`assistant`** agar selaras dengan skema resmi OpenAI.

### Aturan Konversi Parameter Driver Non-OpenAI (e.g. Gemini, Claude):
1. **Gemini SDK/API**:
   - `messages` diubah ke format `contents` dengan role mapping: `"system"` ➔ `systemInstruction`, `"user"` ➔ `parts: [{text}]`.
   - `max_tokens` dipetakan ke `maxOutputTokens`.
2. **Anthropic API (Claude)**:
   - Pesan `"system"` ditarik keluar dari array `messages` dan dimasukkan ke dalam properti tingkat atas: `system: "..."`.
   - Properti `messages` hanya boleh menampung pesan `user` dan `assistant`.

---

## 3. Protokol Penyeragaman JSON Schema Alat (OpenAI Function Tools SOP)
Setiap modul perkakas (*Tool Module*) yang didaftarkan ke sistem wajib menyajikan parameternya dalam format deklaratif **OpenAI JSON Schema**. Penerjemahan ke API lokal penyedia dilakukan secara transparan di tingkat adapter.

### Contoh Definisi Alat yang Valid:
```typescript
export interface ToolMetadata {
  id: string;
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: "string" | "number" | "boolean" | "array" | "object";
      description: string;
      enum?: string[];
      items?: any;
    }>;
    required: string[];
  };
}
```

---

## 4. Format Payload Response & Model Penyadapan Output
Semua response yang diterima dari LLM wajib di-parse melalui satu pipa gerbang terpusat (`StandardizedProcessor`) dan diaudit ke dalam audit log OpenAI.

### Format Representasi Respons yang Diperbolehkan:
1. **Pilihan Jawaban Langsung (content)**:
   ```json
   {
     "choices": [
       {
         "index": 0,
         "message": {
           "role": "assistant",
           "content": "Hasil generasi teks mentah atau string JSON objek"
         },
         "finish_reason": "stop"
       }
     ]
   }
   ```
2. **Pilihan Panggilan Alat (tool_calls)**:
   ```json
   {
     "choices": [
       {
         "index": 0,
         "message": {
           "role": "assistant",
           "content": null,
           "tool_calls": [
             {
               "id": "call_abc123",
               "type": "function",
               "function": {
                 "name": "nama_fungsi_alat",
                 "arguments": "{\"parameter_1\": \"nilai\"}"
               }
             }
           ]
         },
         "finish_reason": "tool_calls"
       }
     ]
   }
   ```

---

## 5. Mekanisme Proteksi & Penanganan Error Format (Anti-Mutation Rule)
Untuk mencegah pengembang atau asisten melakukan perubahan skema parameter secara acak yang dapat merusak sinkronisasi, sistem menerapkan aturan pertahanan berikut:
1. **Immutability of Core Schema**: Segala bentuk penambahan field atau pengurangan field tingkat atas pada parameter API wajib disetujui lewat persetujuan arsitektur dan dicatatkan di `UPDATE_LOG.md`.
2. **Neural Verifier Guard**: Setiap output yang dihasilkan diperiksa integritas formatnya. Jika terdeteksi cacat parsing secara berturut-turut ($\ge 3$ kali):
   - Status `isJson` dinonaktifkan sementara.
   - Panggilan respons dipulihkan ke teks percakapan biasa (*Failsafe Dialogue Fallback*).
3. **Structured Logging**: Semua lalu lintas payload yang memicu error dicatat secara lengkap dengan menyertakan context request/response ke dalam `/api/ai/proxy/audit` untuk mempermudah visualisasi debug oleh pengguna.

---
*(Cetak biru ini mengikat seluruh suprastruktur Yuihime dan dilarang diubah tanpa menaikkan Major Version).*
