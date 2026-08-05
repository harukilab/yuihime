# NATIVE_TOOL_TRANSPORT_MIGRATION

> Rencana migrasi transport tool-calling YuiHime ke **native tool messages penuh (full-parity Kilo/opencode-style)**, dengan kontrak modul bawaan Yui tetap dipertahankan. Status: **Phase 1 ✅ (v4.263) · Phase 2 ✅ (v4.264) · Phase 3 ✅ (v4.265) · Phase 4 ✅ (v4.266) · Phase 5 ✅ (v4.267) · Phase 6 ✅ (v4.268)**.

## 0. Keputusan

- **Dipilih: varian FULL-PARITY** (mengikuti `prompt.ts:1088` opencode + `runner/llm.ts` Kilo).
- Root JSON schema (`thought/speech/final_answer/mood_impact/animations` di satu blob) **dibuang**.
- Modul bawaan Yui harus **berfungsi seperti mestinya** — semua keluaran stabil loop
  (bentuk `immediateResult`, memori, mood, animasi, audit, eventBus) wajib tetap identik.
- Varian adaptif (meta-tool `cognitive_state`) diarsipkan sebagai alternatif — lihat Appendix.

## 1. Tujuan

Loop utama Yui saat ini menjalankan tool calls lewat JSON `tool_calls` di dalam content prompt
(forced `response_format: json_object`), lalu hasil tool disuntikkan sebagai teks
`[SYSTEM_OBSERVATION]` ke user message berikutnya. Kilo (`packages/core/src/session/runner/llm.ts`)
dan opencode dev (`packages/opencode/src/session/prompt.ts:1088` + `processor.ts`) menggunakan
transport native:

- Model mengeluarkan `tool_calls` pada channel API (bukan JSON di dalam teks).
- Hasil tool kembali sebagai message `role: "tool"` yang **durable** (tersimpan di DB, direload tiap turn).
- Loop lanjut selama ada tool call; berhenti saat `finish` bukan `tool-calls` dan tidak ada pending call.
- Step terakhir: `toolChoice: "none"` + `MAX_STEPS_PROMPT` sebagai assistant message.

## 2. Kondisi saat ini (v4.260) — hybrid

Sudah native:
- Tool dikirim via API `tools` array (bukan listing 42 tool di prompt). `PromptManager.ts` header native.
- Scoping per sesi/preset: `context.allowedTools` → `buildOpenAITools(allowedTools?)`.
- `normalizeToolChoice` per provider (auto/none/required/any/tool-id / Gemini `functionCallingConfig`).
- Gemini native function calling (tools + toolConfig) di belakang flag `geminiNativeTools` (default off).

Masih JSON-in-prompt:
- Output model dipaksa JSON (`response_format: {type:'json_object'}` + json_enforcement directive,
  `cortexThinkEngine.ts:494`). Tool calls diekstrak dari JSON via `extractBestJsonObject` /
  `ValidationMiddleware`.
- Hasil tool difold sebagai teks `[SYSTEM_OBSERVATION]` ke `activeIterationInput`
  (`cortexThinkEngine.ts:435-438`), membuat user string membesar.
- Ada kanal sekunder native: `loopContext.assistantToolCalls` + `loopContext.toolMessages`
  dibangun ulang DARI JSON dan di-inject sebelum user turn via `buildChatMessages` per provider
  (`openaiTools.ts:258`). Berfungsi tapi "palsu" — bukan dari channel API.
- Riwayat antar-turn tidak durable sebagai message parts (memori + LlmIoAuditor, bukan reloaded
  sebagai message).

## 3. Gap analysis

| # | Gap | Lokasi | Dampak |
|---|-----|--------|--------|
| A | Model tidak membaca `tool_calls` native dari response API (masih ekstrak JSON) | `generateSegment.ts`, provider drivers, `cortexThinkEngine.ts:542-660` | Transport tetap JSON |
| B | `response_format: json_object` memaksa content → channel tool tidak terpakai | `cortexThinkEngine.ts:494` | Tidak bisa native murni |
| C | Riwayat tool tidak durable/reloadable sebagai message parts | `cortexThinkEngine.ts:1203-1248`, `contextCompactor.ts` | Loop dalam-memory saja |
| D | Root JSON schema dibuang → carrier thought/mood/animations hilang | `cortexThinkEngine.ts:646-767`, banyak modul hilir | Perlu carrier baru (tool args `final_answer`) |
| E | Kompaksi beroperasi pada string `activeIterationInput` + `compactionTurns` | `contextCompactor.ts` | Perlu kompaksi berbasis native messages |
| F | `maxIterations` (default 50) berbeda semantik dari `agent.steps` | `cortexThinkEngine.ts:336` | Semantik batas turn |

## 4. Arsitektur target (full-parity)

Per turn (native mode, `nativeTransport = true`):

```
history = loadNativeMessages(sessionId)          // durable: [system, user, assistant(tool_calls), tool...]
step = 1
while (true) {
  if (finish != "tool-calls" && !hasPendingToolCalls) break   // kilocode exit
  isLastStep = step >= agent.steps
  raw = gateway.run({
    messages: [...history, lastUserTurn],
    tools: nativeTools(allowedTools),
    toolChoice: isLastStep ? "none" : "auto",
    responseFormat: native ? undefined : json_object,          // drop json_object di native
  })
  calls = readNativeToolCalls(raw)                            // tool_calls | tool_use | functionCall
  if (!calls.length) break                                    // teks final di stream
  results = execute(calls)                                    // hub/executors (tidak berubah)
  history.push(assistant(tool_calls=calls))                   // durable append
  history.push(...toolResults(calls, results))                // role:"tool" / tool_result / functionResponse
  saveNativeMessages(sessionId, history)
  if (overflow) compactNative(history)
  step++
}
finalSpeech = text dari assistant message terakhir            // streamed, bukan JSON key
```

**Carrier schema (pengganti root JSON):**
- `thought` → field **reasoning/thinking** dari provider (OpenAI `reasoning_content`, Anthropic
  `thinking`, Gemini `thought`/Gemini `thinking`); jika tidak tersedia → kosong.
- `speech` + `animations` + `mood_impact` → **args dari tool `final_answer`**
  (`{ speech, animations, mood_impact }`). Tool ini sudah ada dan sudah membawa 3 field itu
  (`cortexThinkEngine.ts:1435-1436`, `1321-1333`) — tinggal dijadikan satu-satunya jalur.
- Root `tool_calls` (JSON) → channel API native.
- Tanpa `[SYSTEM_OBSERVATION]`; observasi tetap dicatat sebagai **memory record** (dipertahankan).

## 4.5 Kontrak modul bawaan (WAJIB tidak berubah)

Loop full-parity tetap memproduksi keluaran berikut — ini kontrak stabilitas:

| Keluaran | Konsumen | Catatan |
|---|---|---|
| `immediateResult` shape (`cortexThinkEngine.ts:1444-1468`) | server/UI | `response, nextMood, moodImpact, sentiment, newMemories, actions, tool_calls, animations, tone, iterations, status, ...` — **harus identik** |
| `loopGeneratedMemories` (observation memory `[SYSTEM_OBSERVATION]`) | MemoryModule/DB | tetap ditulis; hanya tidak lagi di-inject ke prompt sebagai teks turn |
| `LlmIoAuditor.recordToolExecution` | UI audit log | tetap |
| `eventBus.emit('OUTPUT_EMITTED')` | UI streaming | tetap (speech final + log tool) |
| `stateMachine` THINKING→EXECUTING→IDLE | status UI | tetap |
| `SystemRegistry.runCortexPhase('PHASE 4: EXECUTION', ..., { rawResult })` | fase hilir | `rawResult` **disintesis dari args tool** (`{ final_answer, tool_calls, animations, mood_impact, thought }`) agar fase hilir tak berubah |
| `iterationsHistory` (iteration/thought/speech/tool calls/observations) | UI + `immediateResult.iterations` | diisi dari native data |
| `CognitiveScheduler.completeTask` / `FastTrackRunner` | task + telemetri | tetap |
| AGI_REFLECT / HighOrderMetacognition / SelfAwarenessMirror | SystemRegistry phases | mandiri dari parsedPayload (`cortexThinkEngine.ts:412-430`) — tak terdampak |
| MoodAnalysisModule / EmotionEngine / EmotionUtils | mood decay/resonance | **mandiri** (hitung dari teks via heuristic, `EmotionEngine.ts:319-436`) — tak membaca `parsedPayload.mood_impact` |
| ValidationMiddleware / jsonExtract | jalur legacy | hanya dipakai untuk provider non-native / structured-output path |

Temuan penting riset: EmotionEngine & MoodAnalysisModule **tidak** membaca root JSON — mereka
mandiri menghitung mood dari teks. Jadi full-parity aman untuk modul emosi; yang perlu dijaga
hanya carrier `final_answer` (speech/animations/mood_impact) dan sintesis `rawResult`.

## 5. Fase implementasi

### Phase 1 — Provider-level native tool_calls reading (low risk)
- **Lokasi:** `src/core/kernel/ai/generateSegment.ts`, `src/core/openaiTools.ts` (helper baru
  `readNativeToolCalls(rawResult, providerId)`), `src/drivers/ai-providers/*.ts`, `aiTypes.ts`.
- **Isi:** Jika response punya `finish_reason === 'tool_calls'` / `tool_use` / `functionCall` parts,
  baca dari channel tersebut; jika tidak ada, jatuh ke jalur JSON lama. JSON mode tetap ON.
- **Verifikasi:** `npm run lint`, `npm run build`, demo `tools/tester/` dengan provider OpenAI+Anthropic.
- **Risiko:** rendah; dual-path.

### Phase 2 — Durable native message store
- **Lokasi:** baru `src/core/cortex/nativeTransport.ts`; `src/core/database.ts` (tabel
  `native_messages(session_id, seq, role, parts)`); `cortexThinkEngine.ts` (load di awal loop,
  append + save per iterasi).
- **Isi:** persist `[user, assistant(tool_calls), tool]` per sesi; reload saat resume/snapshot.
- **Verifikasi:** test `tools/tester/native_transport.test.ts` (tulis→reload urut).
- **Risiko:** skema DB; perlu migrasi sqlite + backup.

### Phase 3 — Native mode utama (default off, flag `nativeTransport`) ✅ **IMPLEMENTED (v4.265)**
- **Lokasi:** `cortexThinkEngine.ts` (drop `response_format` di native, loop break on empty calls),
  `generateSegment.ts` (requestBody tanpa response_format), `openaiTools.ts` (`buildChatMessages`
  memakai history native, bukan rekonstruksi JSON), provider drivers.
- **Isi:** loop memakai message parts durable; `[SYSTEM_OBSERVATION]` hanya untuk JSON mode.
- **Yang dikerjakan (v4.265):**
  - `cortexThinkEngine.ts`: `iterationUsesNative` (flag && provider != gemini) dipakai untuk
    skip `[SYSTEM_OBSERVATION]`, skip first-pass JSON directive, `isJson:false`, hapus
    `response_format`, skip neural-verifier & parallel-streamer per iterasi.
  - Deteksi native per iterasi: `readNativeToolCalls(rawResultStr, provider)` → bila ada
    `tool_calls` di-`parsedPayload` (speech/animations/mood_impact kosong), bila plain text →
    `processedResponse` + `break` (semantik Kilo/opencode: finish != "tool-calls" => stop).
  - `PromptRegistry.ts`: template baru `cortex:native_function_calling` (call via channel;
    final = tool `final_answer` args `{speech, animations, mood_impact}` ATAU plain text).
  - Fallback Gemini (generateSegment belum bawa history multi-turn native) tetap JSON meski
    flag nyala — directive native hanya diterapkan ke provider native-capable per iterasi.
- **Verifikasi:** `tools/tester/native_loop_test.ts` (8/8 PASS) — mock gateway memancarkan
  envelope native tool_calls (turn 1) lalu plain text (turn 2); membuktikan: native calls
  terdeteksi + dieksekusi, plain text memutus loop, `native_messages` menyimpan pasangan
  [assistant(tool_calls), role:tool]. `native_tool_calls.test.ts` (9/9) & `native_transport.test.ts`
  (18/18) tetap hijau; `npm run lint` + `npm run build` OK.
- **Risiko:** tinggi — perubahan inti; backup wajib ke `/tmp/opencode/yuihime-backup/`
  (`core-cortex-cortexThinkEngine.ts.pre-native-ph3.bak`, `core-PromptRegistry.ts.pre-native-ph3.bak`).

### Phase 4 — Carrier `final_answer` + sintesis kontrak (kunci kelestarian modul) ✅ **IMPLEMENTED (v4.266)**
- **Lokasi:** `cortexThinkEngine.ts` (gating prompt JSON per provider, skip ValidationMiddleware
  di native), `ValidationMiddleware` (legacy root-JSON check hanya jalur non-native),
  `ToolExecutorModule.ts` (configSchema `nativeTransport`).
- **Isi:** pastikan semua keluaran §4.5 diproduksi identik; modul hilir tidak tahu transport berubah.
- **Yang dikerjakan (v4.266):**
  - `usesJsonPrompt = !(nativeTransportEnabled && activeProviderId !== 'gemini')` — blok
    "Format Respons Khusus" + append `cortex:json_enforcement` di-*skip* total untuk provider
    native-capable (prompt bersih Kilo-style; hanya directive native yang terpasang). Gemini /
    nativeTransport off tetap JSON. `activeProviderId` dinaikkan ke setup (sebelum blok prompt).
  - `responseUsesNative` dihitung tepat setelah gateway routing (sebelum validasi) dan dipakai
    untuk melewati `ValidationMiddleware.validate(rawResultStr)` — envelope API native / plain
    text tidak lagi memicu `[SCHEMA_ERROR]` noise; validasi argumen carrier `final_answer`
    dilakukan via schema tool-nya sendiri (`APIService.validateSchema`) saat eksekusi.
  - `ToolExecutorModule.configSchema`: field boolean baru `nativeTransport`
    (label "Native Tool Transport (Kilo/opencode-style)", default false, UI auto-render).
  - Keputusan: directive native TETAP diterapkan bersama (native appended setelah json_enforcement
    bila flag nyala), sehingga fallback Gemini tetap pegang JSON tanpa konflik.
- **Verifikasi:** `native_loop_test.ts` (8/8), `native_tool_calls.test.ts` (9/9),
  `native_transport.test.ts` (18/18) hijau; `prompt_assembler.test.ts` tidak regresi
  (2 FAIL Section 4/5 = pre-existing baseline env, baseline repo 5 FAIL); `npm run lint` +
  `npm run build` OK.
- **Risiko:** medium — banyak konsumen `parsedPayload.*`; sintesis `rawResult` krusial.
  Backup: `core-cortex-cortexThinkEngine.ts.pre-native-ph4.bak`,
  `modules-ToolExecutorModule.ts.pre-native-ph4.bak`.

### Phase 5 — Semantik step + kompaksi + default-on ✅ **IMPLEMENTED (v4.267)**
- **Lokasi:** `openaiTools.ts` (`buildChatMessages` + `historyBlocks`), `cortexThinkEngine.ts`
  (turn block per round, reload cross-call, native compaction trim, `toolChoice:'none'` di step
  terakhir), `ToolExecutorModule.ts` (configSchema `nativeTransport`), 5 provider driver
  (OpenAI/Custom/OpenRouter/Anthropic/Local).
- **Isi:** semantic parity penuh dengan Kilo/opencode; matikan fallback JSON per provider
  native-capable setelah masa transisi.
- **Yang dikerjakan (v4.267):**
  - **Interleaved multi-turn history**: `buildChatMessages` menerima `historyBlocks` (array blok
    kanonik `[assistant(tool_calls), ...role:"tool"]` per round) dan meng-interleave per blok —
    memperbaiki bug laten lama di mana seluruh `assistantToolCalls` digabung sebelum seluruh
    `toolMessages` (invalid untuk API OpenAI-compatible multi-turn). Jalur legacy flat tetap utuh.
  - **Turn block per round**: loop menyimpan `loopContext.nativeTurnBlocks` (1 blok per round tool
    call, kanonik), diappend saat persist native.
  - **Cross-call reload**: pada think baru, history durable `native_messages` direkonstruksi jadi
    `nativeTurnBlocks` (row assistant(tool_calls) + row tool berurutan) — provider menerima konteks
    multi-turn lintas pesan user, bukan hanya prompt saat ini.
  - **Native compaction**: hanya saat kompaksi benar-benar terjadi (`didCompact` =
    `postCompactPairs < preCompactPairs`), head blok di-drop dari `nativeTurnBlocks` dan store
    `native_messages` di-rewrite (`clearNativeMessages` + `appendNativeMessages`) sehingga reload
    berikutnya memuat konteks terkompaksi. Guard `didCompact` mencegah spurious wipe di iterasi
    pertama think yang me-reload history (bug ditemukan & difix saat verifikasi).
  - **Last step**: `loopContext.toolChoice = isLastStep ? 'none' : undefined` — model dipaksa
    menjawab plain text di step terakhir (parity Kilo), melengkapi `disableTools` + `compileMaxStepsPrompt`.
  - **Keputusan: default-on DITUNDA** — `nativeTransport` tetap default false. Parity penuh sudah
    diimplementasikan & lolos suite, tapi belum pernah diverifikasi terhadap provider API nyata
    (hanya mock). Rollback §8 tetap jalan: flag false = JSON mode selalu tersedia.
- **Verifikasi:** `native_loop_test.ts` (13/13 — termasuk reload think kedua dari store +
  interleaving order + anthropic alternation + legacy fallback), `native_compaction_test.ts`
  (6/6 — store ter-trim: 12 rows → 9), `native_tool_calls.test.ts` (9/9),
  `native_transport.test.ts` (18/18); `npm run lint` + `npm run build` OK;
  `prompt_assembler.test.ts` tidak regresi (2 FAIL Section 4/5 = pre-existing baseline).
- **Risiko:** kompaksi paling rawan; pertahankan fallback flag. Backup:
  `core-cortex-cortexThinkEngine.ts.pre-native-ph5.bak`, `core-openaiTools.ts.pre-native-ph5.bak`,
  `ai-providers-{OpenAIProvider,CustomProvider,OpenRouter,AnthropicProvider,LocalProvider}.ts.pre-native-ph5.bak`.

### Phase 6 — Native multi-turn penuh untuk Gemini ✅ **IMPLEMENTED (v4.268)**
- **Lokasi:** `generateSegment.ts` (`buildGeminiHistoryContents` + `config.history`), `GeminiProvider.ts`
  (teruskan `context.nativeTurnBlocks`), `cortexThinkEngine.ts` (cabut 3 gate `!== 'gemini'`),
  `aiTypes.ts` (AIConfig.history).
- **Isi:** menutup gap satu-satunya — sebelumnya Gemini dikecualikan dari transport native karena
  `generateContent` selalu membangun `contents` single-turn (`[{ role:'user', parts }]`), sehingga
  history tool-call multi-round tidak punya saluran. Sekarang history native diubah ke format
  `contents` Gemini dan gate di loop dicabut.
- **Yang dikerjakan (v4.268):**
  - **`buildGeminiHistoryContents(history)`** (di-export untuk test): blok kanonik
    `[assistant(tool_calls), ...role:"tool"]` → `contents` Gemini: `role:"model"` dengan `functionCall`
    parts segera diikuti `role:"user"` dengan `functionResponse` parts (alternasi yang diwajibkan API
    Gemini untuk multi-turn function calling). Args JSON-string di-coerce ke object
    (`coerceArgsForGemini`); content envelope `{success,data,error,metadata}` di-parse kembali ke
    object (`parseToolResponseContent`, fallback `{result: content}`). Blok malformed di-skip.
  - **`config.history`** (`AIConfig` baru): `generateContent` meng-prepend `buildGeminiHistoryContents`
    ke `contents` sebelum user turn saat ini; tanpa history, jalur single-turn tetap byte-identik.
  - **`GeminiProvider.generate`**: meneruskan `context.nativeTurnBlocks` sebagai `history` di kedua
    jalur (server `aiService.generate` + browser `/api/ai/generate`). Pemanggilan sudah mengembalikan
    envelope kanonik `{tool_calls:[...]}` untuk functionCall parts (streaming & non-streaming) sejak
    Phase 1, jadi `readNativeToolCalls(..., 'gemini')` langsung bekerja tanpa perubahan.
  - **Cabut 3 gate `!== 'gemini'`** di `cortexThinkEngine.ts`: `usesJsonPrompt` (= `!nativeTransportEnabled`),
    `iterationUsesNative` (= `nativeTransportEnabled`), `responseUsesNative` (= `iterationUsesNative`).
    Gemini kini masuk native channel penuh saat flag `nativeTransport` aktif (skip JSON block +
    json_enforcement + ValidationMiddleware + `[SYSTEM_OBSERVATION]` fold, `toolChoice:'none'` di last
    step via `functionCallingConfig`). Flag tetap default **off** (keputusan default-on tetap ditunda).
- **Verifikasi:** `native_gemini_test.ts` BARU (14 unit `buildGeminiHistoryContents` + 11 loop
  end-to-end, provider `gemini`, mock gateway gemini-envelope — tool dieksekusi, native_messages
  persisted, turn 2 menerima 1 blok interleaved, konversi loop → `["model","user"]` dengan
  functionCall `mock_probe`); regresi penuh: `native_loop_test.ts` 13/13, `native_compaction_test.ts`
  6/6, `native_tool_calls.test.ts` 9/9, `native_transport.test.ts` 18/18; `npm run lint` + `npm run build`
  OK. Backup: `kernel-ai-generateSegment.ts.pre-native-ph6.bak`,
  `ai-providers-GeminiProvider.ts.pre-native-ph6.bak`,
  `core-cortex-cortexThinkEngine.ts.pre-native-ph6.bak`, `kernel-ai-aiTypes.ts.pre-native-ph6.bak`.
- **Risiko:** hanya diverifikasi lewat mock gateway (bukan API Gemini nyata) — pertahankan fallback
  flag; urutan `functionResponse.name` harus cocok dengan `functionCall.name` (diuji).

## 6. File terdampak (estimasi)

| File | Peran | Fase |
|------|-------|------|
| `src/core/cortex/cortexThinkEngine.ts` (~1569 ln) | loop utama: entry/exit, build messages, extract calls, sintesis kontrak | 1–5 |
| `src/core/openaiTools.ts` | helper read native calls, rebuild messages dari history | 1, 3 |
| `src/core/kernel/ai/generateSegment.ts` | requestBody: hapus response_format di native | 1, 3 |
| `src/core/kernel/ai/aiTypes.ts` | AIConfig tambah `responseFormat`/`native` | 1, 3 |
| `src/modules/ProviderGatewayModule.ts` | plumbing context + tools/toolChoice | 3 |
| `src/drivers/ai-providers/*.ts` | parsing tool_calls per provider (OpenAI, Custom, OpenRouter, Anthropic, Gemini, Local) | 1, 3 |
| `src/core/cortex/nativeTransport.ts` *(baru)* | durable message store + CRUD | 2 |
| `src/core/database.ts` | tabel `native_messages` + migrasi | 2 |
| `src/core/cortex/contextCompactor.ts` | kompaksi native message list | 5 |
| `src/core/openaiTools.ts` | buildChatMessages `historyBlocks` interleaved | 5 |
| `src/core/kernel/ai/generateSegment.ts` | `buildGeminiHistoryContents` + `config.history` → `contents` multi-turn | 6 |
| `src/core/kernel/ai/aiTypes.ts` | AIConfig.history (native turn blocks) | 6 |
| `src/drivers/ai-providers/GeminiProvider.ts` | teruskan `context.nativeTurnBlocks` ke generateContent | 6 |
| `src/modules/PromptManager.ts` | configSchema `nativeTransport`, hapus json_enforcement, docs args `final_answer` | 4 |
| ValidationMiddleware | validasi args tool | 4 |
| `src/core/kernel/processor.ts` | sanitize (jalur legacy JSON) — disesuaikan | 4 |
| modul mood/animasi/speech | baca dari args `final_answer` (via sintesis) — **tanpa perubahan API** | 4 |
| `tools/tester/` | test native reading, transport roundtrip, loop, regression kontrak | tiap fase |
| `tools/tester/native_loop_test.ts` *(baru)* | loop end-to-end native (mock gateway: native tool_calls → plain-text final; reload think kedua; interleaving) | 3, 5 |
| `tools/tester/native_compaction_test.ts` *(baru)* | kompaksi native: store `native_messages` ter-trim bersama turn blocks | 5 |
| `tools/tester/native_gemini_test.ts` *(baru)* | loop end-to-end Gemini (provider `gemini`, mock envelope functionCall) + unit `buildGeminiHistoryContents` | 6 |

## 7. Urutan rekomendasi

Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6. Phase 1-2 aman dan bisa digabung.
Phase 3 adalah titik tanpa kembali (perlu rollout bertahap per provider). **Phase 4 adalah
prasyarat wajib** sebelum Phase 3 dinyalakan default — kontrak §4.5 harus lolos regression dulu.
Phase 6 menutup gap Gemini (native multi-turn penuh); sisa pekerjaan hanyalah **validasi terhadap
provider API nyata** sebelum default-on.

## 8. Rollback

- Tiap phase diawali backup ke `/tmp/opencode/yuihime-backup/` (`<dir>-<file>.pre-native.bak`).
- Flag `nativeTransport` (default false) memastikan JSON mode tetap jadi jalur kanan kapan saja.
- Tabel `native_messages` bisa di-drop tanpa efek pada tabel lain.

## 9. Catatan referensi

- Kilo: `packages/core/src/session/runner/llm.ts` — materialize(permissions), `toolChoice:'none'`
  di last step, `MAX_STEPS_PROMPT`, overflow → kompaksi → retry turn.
- opencode dev: `packages/opencode/src/session/prompt.ts:1088-1336` — loop `while(true)`, exit saat
  finish bukan `tool-calls` && !hasToolCalls, `SessionTools.resolve` (scoping), `StructuredOutput`
  tool + `toolChoice:'required'` untuk JSON schema, `agent.steps`.
- opencode & Kilo share `MAX_STEPS_PROMPT` dari `@opencode-ai/core/session/runner/max-steps`.

## Appendix A — Varian adaptif (ditolak, diarsipkan)

Alternatif awal: meta-tool `cognitive_state` (`{ thought, mood_impact, animations, speech }`) untuk
membawa schema kaya ke channel native tanpa menyentuh modul hilir. Ditolak karena user memilih
full-parity — carrier `final_answer` (§4) mencapai tujuan yang sama lebih dekat ke referensi
(tanpa tool tambahan yang tidak ada di Kilo/opencode). Catatan: jika kelak modul hilir kesulitan
beradaptasi dengan sintesis, meta-tool ini bisa dihidupkan kembali sebagai fallback.
