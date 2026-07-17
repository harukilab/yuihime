# Plan: Standardisasi Tool Layer YuiHime ke Kontrak OpenAI-Native

## Tujuan
Jadikan arsitektur pemanggilan tool YuiHime **provider-agnostic & OpenAI-standard** di seluruh pipeline
(cortex ↔ gateway ↔ provider), tanpa mengubah format kognisi cortex (`thought` / `animations` / `mood_impact`)
dan tanpa mengubah skema manifest tool (sudah OpenAI JSON Schema).

Keputusan yang sudah disepakati dengan user:
1. **Pertahankan** JSON cortex (thought/animations/mood) sebagai reasoning side-channel; field `tool_calls` diubah ke format OpenAI native.
2. **Semua provider** (OpenAI / Custom / OpenRouter / Anthropic / Gemini-Local / OfficialChat) dinormalisasi ke kontrak OpenAI tool via satu layer adaptor.

## Kontrak Kanonik (OpenAI-native) — sumber kebenaran tunggal
- **Tool call**: `{ id: string, type: "function", function: { name: string, arguments: object } }`
  - `arguments` selalu **object** (bukan string JSON). Cortex yang emit via prompt WAJIB generate `id` (`call_<rand>`).
- **Tool result**: pesan OpenAI `{ role: "tool", tool_call_id: string, content: string }`.
- **Tool definition** (sudah ada): `buildOpenAITools()` → `[{ type:"function", function:{ name, description, parameters } }]`.
- `send_final_reply` & `send_status_update` tetap berupa function call standar (tool istimewa).

## Temuan Audit (status saat ini)
- `buildOpenAITools()` (src/core/openaiTools.ts) sudah standar → pertahankan.
- `nativeToolCallsToXml()` mengubah `tool_calls` OpenAI jadi XML `<tool_calls>` untuk cortex. **Ini dibuang**, diganti normalizer ke shape OpenAI.
- OpenAI / Custom / OpenRouter: native `tool_calls` sudah jalan, tapi masih di-convert ke XML (src/drivers/ai-providers/OpenAIProvider.ts:213, CustomProvider.ts:203, OpenRouter.ts:135).
- Anthropic (AnthropicProvider.ts): kirim ke `/api/ai/proxy`→Anthropic `/v1/messages`, **tidak** kirim `tools`, **tidak** parse `tool_use`.
- Local/Ollama (LocalProvider.ts:36): pakai endpoint `/generate` (bukan chat), **tidak** kirim `tools`, **tidak** parse `tool_calls`.
- OfficialChat (OfficialChatProvider.ts): tidak ada penanganan tool native.
- Cortex (src/core/cortex/cortexThinkEngine.ts) parse hybrid `{tool,args}` + XML; hasil tool dikembalikan lewat **memory channel** (`[SYSTEM_OBSERVATION]`) ke system prompt, bukan `role:"tool"`.
- `ToolExecutorModule.run` sudah terima `call.tool||call.name` & `call.args||call.arguments` (src/modules/ToolExecutorModule.ts:43-46) — perlu juga baca `call.id`/`call.function`.

## Langkah Implementasi

### 1. `src/core/openaiTools.ts` — single adapter layer (inti)
- Hapus `nativeToolCallsToXml`.
- Tambah:
  - `normalizeToolCallsToOpenAI(message: any, providerId: string): ToolCall[]` — terima respons mentah provider, kembalikan array `tool_calls` OpenAI. Branch per `providerId`:
    - `openai`/`custom`/`openrouter`/local-ollama: `message.tool_calls` (arguments parse dari string→object).
    - `anthropic`: blok `tool_use` → `{id, type:"function", function:{name, arguments}}`.
    - `gemini`: `functionCall` part → shape sama.
    - `officialchat`: sesuai formatnya.
  - `normalizeToolsForProvider(tools: any[], providerId: string): any` — adaptasi `tools` ke format provider:
    - OpenAI-compatible: passthrough.
    - `anthropic`: `tools:[{name, description, input_schema: parameters}]`.
    - `gemini`: `tools:[{functionDeclarations:[{name, description, parameters}]}]`.
  - `buildToolResultMessages(results: {tool_call_id, content}[], providerId?): any[]` — kembalikan `role:"tool"` messages (untuk Anthropic jadi `tool_result` content block, Gemini jadi `functionResponse` part — branch by providerId).
- Pertahankan `buildOpenAITools()`.

### 2. Provider adapters (`src/drivers/ai-providers/*`)
- **OpenAIProvider / CustomProvider / OpenRouter**: hentikan pemanggilan `nativeToolCallsToXml`; kembalikan `message.tool_calls` apa adanya (gateway yang normalisasi). Pastikan `arguments` di-parse ke object.
- **AnthropicProvider**: gunakan `normalizeToolsForProvider(ctx.tools,'anthropic')`; sertakan `tools` di body proxy; di respons, ekstrak `tool_use` → `tool_calls` lewat normalizer. Saat ada `role:"tool"` result, kirim sebagai `tool_result` content block.
- **LocalProvider**: upgrade ke endpoint chat OpenAI-compatible (`${baseUrl}/v1/chat/completions` atau Ollama `/api/chat`) yang mendukung `tools`+`tool_calls`; teruskan `ctx.tools`; parse `tool_calls` via normalizer.
- **OfficialChatProvider**: tambah penanganan `tools`/`tool_calls` mirip OpenAI.
- **GeminiProvider**: tambah `functionDeclarations` + parse `functionCall`/`functionResponse`.
- Setiap provider cukup memanggil normalizer dari `openaiTools.ts` (tidak duplikasi logika translasi).

### 3. `src/modules/ProviderGatewayModule.ts`
- Di `primaryProvider.generate` & fallback (baris ~128-133, 179-184): teruskan `tools: buildOpenAITools()` (sudah ada) dan `toolMessages: context.toolMessages` (array `role:"tool"` dari cortex).
- Setelah `result` diterima, jangan asumsikan XML; cortex akan panggil `normalizeToolCallsToOpenAI(result, providerId)`.

### 4. Cortex `src/core/cortex/cortexThinkEngine.ts`
- Ganti parser `tool_calls`: baca shape OpenAI `{id, function:{name, arguments}}` (pertahankan alias `tool`/`args` saat transisi).
- Saat emit via prompt (provider tanpa native FC), cetak `tool_calls` OpenAI-shaped (dengan `id` `call_xxx`).
- **Feedback hasil tool**: selain memory integration (dipertahankan untuk episodic memory & dataset), bangun & propagasi array `role:"tool"` messages (`tool_call_id` dari tiap call) ke iterasi berikutnya via `context.toolMessages`. Update builder memori baris ~1060 & ~1080 ke `function.name`/`function.arguments`.
- `send_final_reply` tetap function call; `processedResponse` diisi dari `observation.speech` seperti sekarang.

### 5. `src/modules/ToolExecutorModule.ts`
- Baca `call.id` / `call.function.name` / `call.function.arguments`; hasil dikembalikan lengkap dengan `tool_call_id` agar cortex bisa susun `role:"tool"`.

### 6. `src/core/PromptRegistry.ts` & `src/core/kernel/processor.ts` & `ValidationMiddleware.ts`
- Prompt schema cortex: `tool_calls` berisi array OpenAI-shaped (`id`,`type:"function"`,`function:{name,arguments}`). Field `thought`/`animations`/`mood_impact` tetap.
- Detektor XML/JSON terima shape OpenAI `tool_calls` (sudah sebagian; samakan).

## Batas & Catatan
- Manifest tool (`manifest.json`) & `ToolModule` type **tidak** diubah (sudah OpenAI JSON Schema).
- Format dataset SFT & animasi tsundere **tetap** utuh (cortex tetap emit JSON kustom di `content`; hanya field `tool_calls` yang jadi standar).
- Memory channel `[SYSTEM_OBSERVATION]` dipertahankan sebagai episodic memory; `role:"tool"` messages adalah channel standar ke LLM.

## Risiko
- Anthropic/Local/Gemini butuh kode native tool net-new (belum ada). Perlu uji tiap provider.
- Perubahan cara feedback tool (tambah `role:"tool"`) bisa menggeser perilaku loop; validasi dengan prompt ber-tool.
- `arguments` harus konsisten object vs string antar provider — normalizer menyeragamkan ke object.

## Validasi
1. `npm run lint` (tsc --noEmit) hijau.
2. Unit `openaiTools.ts`: `normalizeToolCallsToOpenAI` untuk sampel respons OpenAI, Anthropic, Gemini, Ollama → shape OpenAI identik; `normalizeToolsForProvider` untuk anthropic/gemini.
3. Integration (dev): kirim prompt yang memicu `web_search`/`calculator` via masing-masing provider; verifikasi `tool_calls` ter-parse ke shape OpenAI, `role:"tool"` result masuk ke panggilan LLM berikutnya, dan `send_final_reply` menghasilkan balasan akhir.
4. Regression: prompt tanpa tool tetap menghasilkan respons cortex JSON normal (thought/animations/mood utuh).
