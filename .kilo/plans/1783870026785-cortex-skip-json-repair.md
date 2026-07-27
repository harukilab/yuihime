# Plan: Cegah Eskalasi Tak Perlu ke LLM JSON-Repair pada Cortex

## Bukti dari log runtime (DB `/home/userland/.yuihime/data/yuihime.db`, key `yuihime_llm_io_audit_logs`)
- Provider = **gemini**, model = **gemma-4-26b-a4b-it** (bukan model kecil; model besar pun bocor CoT).
- Giliran rusak ts `2026-07-12T16:55:20Z`: prompt yang di-reuse = input user + blok
  `[SYSTEM_OBSERVATION]` (hasil `list_files`) + `[IMPORTANT INSTRUCTION]` + `[CRITICAL DIRECTIVE
  FOR RETRIEVED CONTENTS]`.
- Respons model = monolog CoT (Plan / Response Draft / Revised Draft / Final JSON structure)
  **+ dua objek JSON berurutan** `{obj1}{obj2}`. Di akhir SEBENARNYA ada 1 objek JSON valid:
  `{"speech":..., "animations":[...], "mood_impact":{...}, "tone":{...}}`.
- Giliran berikutnya ts `2026-07-12T16:56:13Z` = panggilan **`repairJsonFormatWithLLM`**
  (prompt `cortex:repair_json`) yang SUKSES mengekstrak `send_final_reply`. Ini membuktikan
  eskalasi ke LLM-repair benar-benar terjadi padahal objek JSON valid sudah ada di akhir respons.

## Diagnosis (kenapa output kena JSON-repair padahal bisa langsung dieksekusi)
Sampel output milik user adalah: monolog perencanaan (CoT) berbahasa Inggris
("Plan:", "Response Draft:", "Revised Draft:", "Final JSON structure:") **diikuti dua
objek JSON berurutan** (`{obj1}{obj2}`) — bukan satu objek JSON valid.

Alur parsing di `cortexThinkEngine.ts` (fungsi `executeCortexThink`, mode JSON,
bukan `isResettingFormat`):
1. `JSON.parse(cleanJsonStr)` gagal (ada prose + 2 objek).
2. `locallyRepairJson` (`processor.ts`) menormalisasi brace tapi tetap menghasilkan
   `{obj1}{obj2}` → `JSON.parse(repaired)` gagal.
3. **Bracket isolation** (`cortexThinkEngine.ts:497-513`): mengambil dari `firstBrace`
   (kurung pertama, di "Final JSON structure: {") sampai `lastBrace` (kurung terakhir
   dari objek ke-2) → menghasilkan `{obj1}{obj2}` yang tidak valid → gagal.
4. `parsedPayload` masih null → masuk blok `isPlanningThought` (`:559`) yang **hanya
   men-log**, tidak mengekstrak.
5. `cortexThinkEngine.ts:565-567`: `if (!parsedPayload)` **langsung memanggil
   `repairJsonFormatWithLLM`** (1x round-trip LLM ekstra via `thinkSimple`).
   Inilah "kena json repair" yang user keluhkan.

Penyebab akar:
- **A. Bracket isolation salah**: menggabungkan semua objek menjadi `{obj1}{obj2}`.
  Harus mengekstrak **objek JSON terakhir yang seimbang (balanced)** agar `obj2`
  (yang valid & lengkap) langsung didapat tanpa LLM.
- **B. Urutan salah**: deterministic extractor (monologue-stripper + trailing-JSON)
  ditaruh DI BAWAH `repairJsonFormatWithLLM`, sehingga baru dijalankan bila repair LLM
  gagal — padahal harus dijalankan **sebelum** repair LLM.
- **C. Monologue-stripper sempit** (`cortexThinkEngine.ts:654-680`): hanya menyaring
  baris yang diawali `"i should"`, `"user wants"`, dll. Framing model
  ("Plan:", "Response Draft:", "Revised Draft:", "Final JSON structure:") tidak
  tertangkap, sehingga `cleanSpeech` tetap berisi sampah → fallback ke LLM.
- **D. Kontradiksi system prompt (akar utama bocoran CoT)**. Base `system_prompt.md`
  (`src/share/prompts/system_prompt.md:43-74,111-156`) secara eksplisit mewajibkan model
  mengekspresikan emosi lewat **tag XML** `<animations>` / `<mood_impact>` / `<tone>` (dengan
  contoh XML). Namun `cortex:json_enforcement` yang ditempel ke `assembledSystemPrompt`
  (`cortexThinkEngine.ts:300-311`) MELARANG tag XML dan mewajibkan key JSON `animations` /
  `mood_impact`. Model (`gemma-4-26b-a4b-it`) jadi bingung → menghasilkan hybrid: menulis
  "Append `<animations>`, `<mood_impact>`, and `<tone>` tags" di CoT lalu menumpuk dua objek
  JSON. Skema preset `tiny`/`lite`/`medium` juga memakai key `speech` (bukan `final_answer`)
  dan model menambah key `tone` yang tak ada di skema utama, memperparah ketidakstandaran.

## Tujuan
Output yang sebenarnya sudah berisi 1 JSON valid (di akhir) harus langsung diekstrak
tanpa memanggil `repairJsonFormatWithLLM`. LLM-repair hanya menjadi *last resort*
bila semua metode deterministik gagal.

## Implementasi (berurutan)

### T1 — Helper ekstraksi JSON terakhir yang seimbang
Tambah `extractBestJsonObject(text: string): string | null` (letak: `src/core/kernel/processor.ts`
atau file baru `src/core/cortex/jsonExtract.ts`):
- Cari indeks `{` terakhir (`lastOpen`) yang memiliki pasangan `}` seimbang (menggunakan
  stack brace `{}` `[]` sambil menghormati string-literal).
- Parse substring `text.slice(lastOpen, close+1)`; jika `JSON.parse` sukses, kembalikan.
- Fallback: coba juga objek PERTAMA yang seimbang (untuk kasus prose di akhir).
Gunakan helper ini menggantikan bracket-isolation di:
- `cortexThinkEngine.ts:497-513` (pakai hasil parse langsung).
- `jsonRepairer.ts:26-31` (bracket isolation di dalam repairer).

### T2 — Reorder: ekstraksi deterministik SEBELUM LLM-repair
Di `cortexThinkEngine.ts`, pindahkan/duplikasi blok ekstraksi murah agar dijalankan
**sebelum** `:565` (`repairJsonFormatWithLLM`):
- Jalankan `extractBestJsonObject` terlebih dahulu (T1).
- Jalankan `parseLLMResponse` (XML) dan monologue-stripper (T3) terlebih dahulu.
- Hanya jika semua di atas null, panggil `repairJsonFormatWithLLM` (pertahankan sbg
  last resort). Ini menghilangkan 1 round-trip LLM untuk kasus user.

### T3 — Perluas monologue-stripper
Di `cortexThinkEngine.ts:654-680`, tambahkan prefix/fragment penanda ke `isMonologue`:
`"plan:"`, `"response draft:"`, `"revised draft:"`, `"final json structure:"`,
`"final json:"`, `"here is"`, `"my draft"`, `"according to the instructions"`.
Plus: bila setelah penyaringan masih ada objek JSON di `cleanSpeech`, ekstrak via
`extractBestJsonObject` (T1) alih-alih membuangnya.

### T4 — Hygiene prompt & resolusi kontradiksi XML↔JSON
1. **Neutralisir instruksi tag XML di mode JSON** (`cortexThinkEngine.ts:300-311`,
   saat menempel `cortex:json_enforcement`): sebelum menempel, strip/normalkan bagian
   "Format Respons" bergaya XML (`<animations>`/`<mood_impact>`/`<tone>`) dari
   `assembledSystemPrompt` (base `system_prompt.md:43-74,111-156`) via regex aman, ATAU
   tambahkan kalimat resolusi konflik yang tegas: "The base system prompt's XML tag
   instructions (`<animations>`, `<mood_impact>`, `<tone>`) are DISABLED in JSON mode.
   Use the JSON keys `animations` and `mood_impact` only."
2. Di `cortex:json_enforcement` (dan preset `tiny`/`lite`/`medium` di `get()`):
   - Tambah kalimat wajib: "Output EXACTLY ONE JSON object. Do NOT write planning
     prose, chain-of-thought, or multiple JSON objects outside that single object."
   - Samakan key: preset kecil cukup pakai `final_answer` (sudah disinkronkan ke `speech`
     di processor). NYATAKAN `tone` BUKAN bagian skema cortex (abaikan/jangan emit; suara
     diatur lewat modul terpisah).
   (Perubahan serupa sudah dilakukan di task 4.43 untuk shape `tool_calls`; ini
   melengkapi ketatnya format + menghilangkan kontradiksi akar.)

## File yang disentuh
- `src/core/cortex/jsonExtract.ts` (baru) — T1.
- `src/core/cortex/cortexThinkEngine.ts` — T1 (ganti bracket-isolation), T2 (reorder), T3 (stripper).
- `src/core/cortex/jsonRepairer.ts` — T1 (pakai helper di bracket-isolation).
- `src/core/kernel/processor.ts` — T1 (ekspor helper, opsional).
- `src/core/PromptRegistry.ts` — T4.

## Risiko
- Ekstraksi "objek terakhir" bisa salah ambil jika ada JSON di dalam prose penutup;
  mitigasi: validasi `JSON.parse` + cek keberadaan field minimal (`thought`/`speech`/
  `final_answer`/`tool_calls`); jika gagal, fallback ke first-object lalu ke LLM-repair.
- Perubahan urutan parsing bisa mengubah perilaku loop pada model kecil; validasi dgn
  prompt ber-tool (lihat Validasi #2).

## Validasi
1. **Unit** `extractBestJsonObject` dengan sampel user (prose + `{obj1}{obj2}`):
   harus mengembalikan `obj2` (parseable, berisi `speech`). Tambah juga kasus
   prose → `{obj}` dan `{obj}` → prose.
2. **Integration (dev)**: kirim prompt pemicu `list_files` via provider kecil/lokal;
   pastikan log `[CORTEX_LOOP]` TIDAK memuat `Engaging isolated LLM JSON format
   repairer` dan respons langsung terbentuk dari hasil `list_files` (tanpa
   `repairJsonFormatWithLLM`).
3. **Regression**: prompt tanpa tool tetap menghasilkan JSON cortex normal
   (`thought`/`animations`/`mood_impact`/`final_answer` utuh) dan tidak naik ke
   LLM-repair untuk output yang sudah valid.
4. `npm run lint` (tsc --noEmit) hijau.
