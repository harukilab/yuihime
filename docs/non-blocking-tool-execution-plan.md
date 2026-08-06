# Non-Blocking Background Tool Execution Plan

> **Status: IMPLEMENTED.** Dispatcher di `src/core/kernel/BackgroundToolDispatcher.ts` (enqueue/getPending/drain, concurrency default 4, `Promise.allSettled`, TTL 5 menit, event `TOOL_BG_*` + `broadcastToWS`), interim reply + pending injection di `src/core/kernel/NeuralInterface.ts:369-423`.

## Current State (Masalah)

- Tool execution terjadi di `cortexThinkEngine.ts` menggunakan `Promise.all(toolPromises)` — paralel tapi **masih blocking** final answer (sekarang: `toolPromises` di ~:1330, `Promise.all` di ~:1586; cabang background-dispatcher di ~:1197-1255).
- User harus tunggu semua tool selesai baru dapat balasan.
- Belum ada mekanisme "kirim status sekarang, lanjutkan tool nanti". *(telah diatasi via dispatcher)*

## Target Architecture

- Ketika LLM menghasilkan `tool_calls`, Yui **langsung kirim reply interim** (misal: "Sedang mengerjakan request kamu...").
- Tool dieksekusi di **background worker** tanpa memegang event loop utama.
- Hasil tool disimpan per `contextId` → bisa dipakai di turn berikutnya atau di-merge ke memory.
- Mendukung multi-tool paralel, termasuk tool yang sama dijalankan bersamaan oleh konteks berbeda.

## Phases

### Phase 1: Background Tool Dispatcher
- File baru: `src/core/kernel/BackgroundToolDispatcher.ts`
- Singleton, thread-safe queue + worker pool kecil.
- Method:
  - `enqueue(contextId, toolCalls, state, context)` -> returns `Promise<ToolResult[]>`
  - `getPending(contextId)` -> returns pending promise/reference
  - `drain(contextId)` -> wait + return all results
- Eksekusi via `Promise.allSettled`, batasi concurrency default misal 4.
- Timeout per tool tetap dihargai dari config `tool-executor`.

### Phase 2: Interim Reply + Context Injection
- Di `cortexThinkEngine.ts`, saat terdeteksi `toolsToCall.length > 0`:
  - Kirim interim reply via `eventBus.emit('OUTPUT_EMITTED', { response: interimText })`.
  - Panggil `BackgroundToolDispatcher.enqueue(...)`.
  - Return immediate result dengan `tool_calls` + `pendingToolRef`.
- Pada turn berikutnya, sebelum masuk ke LLM, inject pending results sebagai tool message buatan LLM + resume loop jika perlu.

### Phase 3: Pending State Management
- Tambah storage opsional untuk `pending_tools`:
  - `contextId`, `toolCallId`, `toolName`, `args`, `result`, `status`, `timestamp`.
- Atau gunakan `Map<string, { promise, results, timestamp }>` dengan cleanup setiap 10 menit.
- Jika user kirim pesan baru sebelum tool selesai, Yui bisa jawab "Toolnya masih berjalan, hasilnya nanti."

### Phase 4: UI / WS Status Update
- Emit event `TOOL_BG_STARTED`, `TOOL_BG_COMPLETED`, `TOOL_BG_FAILED` via `eventBus` + `broadcastToWS`.
- Web UI bisa show spinner + daftar tool yang sedang jalan.

## Files to Modify/Create
| File | Action |
|------|--------|
| `src/core/kernel/BackgroundToolDispatcher.ts` | NEW — core background worker |
| `src/core/cortex/cortexThinkEngine.ts` | MODIFY — split tool execution to background, send interim reply |
| `src/core/kernel/NeuralInterface.ts` | MODIFY — inject pending tool results into next context (implemented here) |
| `src/core/kernel/MultiChannelQueue.ts` | MODIFY — allow interim reply, handle background completion gracefully (interim reply ditangani di `NeuralInterface`, bukan di sini) |
| `shared/core/registry.ts` | maybe minor — already parallel-aware, keep |

## Risks & Mitigations
| Risk | Mitigation |
|------|-----------|
| Tool mutates state while user continues chatting | Semua tool result di-queue; hanya di-apply setelah `drain()` atau user minta resume |
| Memory leak dari pending promises | TTL + cleanup scheduler, max 5 menit |
| Duplicate tool execution | Idempotency key via `toolCallId` per context |
| Backward compatibility | Jika dispatcher off, fallback ke synchronous execution lama |

## Estimasi
- 2–3 hari kerja: core dispatcher + test + integration.
- Bisa diulang bertahap: mulai dari tool yang **read-only** (`read_file`, `web_search`) dipindah dulu, baru tool yang write (`run_command`, `execute_sql`).
