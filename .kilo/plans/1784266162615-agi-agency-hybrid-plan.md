# Rencana: Penguatan Agensi AGI Yuihime (Mode Hybrid)

## Mode & Default (KEPUTUSAN FINAL)
Ada 3 mode reasoning AGI, dipilih via `configSchema` `reasoningMode` (di modul `yui-agi` / tiap modul kritis):
- `heuristic` — modul 100% pakai rumus/Math, TIDAK panggil LLM (behavior saat ini).
- `hybrid` — **DEFAULT**. Baseline heuristic; panggil `context.think` (provider utama user) HANYA saat trigger berat.
- `full` — semua modul kritis selalu panggil `context.think` tiap turn.

**Default rilis = `hybrid`, TAPI master-switch `useLLMReasoning = false` (OFF).**
Artinya: saat fitur diluncurkan, efektif = heuristic (aman, gratis, behavior tak berubah). User menyalakan satu toggle → langsung hybrid. Full-LLM = pilihan lanjutan (`reasoningMode: 'full'`).

## Tujuan
Mengubah 24 modul AGI dari "penyusun `soulDirective` (pre-prompt statis)" menjadi **subkorteks yang berpartisipasi aktif dalam loop kognitif berulang**, sehingga Yuihime terasa seperti AGI sungguhan (agensi, goal-seeking, self-model, pembelajaran nyata) — tanpa membongkar `executeCortexThink` dan dengan trade-off latensi/biaya terkendali (mode hybrid: heuristic baseline + LLM by trigger, selalu lewat `settings.provider` user).

## Konteks & Temuan (dari kode)
- `executeCortexThink` (`src/core/cortex/cortexThinkEngine.ts`) **sudah punya ReAct loop** (`while iteration < maxIterations`, gateway → tool → observation → re-loop). Jadi saran #1 (loop ReAct) sudah ada; yang lemah adalah partisipasi modul AGI di dalamnya.
- 24 modul AGI (di `src/modules/agi/`) umumnya hanya menghitung angka (mood, neurotransmitter, hallucination index via `Math.random()`/`if-else`) lalu **menempel string ke `context.soulDirective`**. Mereka tidak bernalar, hanya "prompt-engineer terdistribusi".
- `context.think` sudah disiapkan di `cortexThinkEngine.ts:1589` = `cortexInstance.thinkSimple(p)`. `thinkSimple` (`src/core/cortex.ts:184`) memanggil `provider-gateway` dengan `settings.provider` user — aman & reusable sebagai entry LLM (ikut setting provider, bukan model kecil hardcode).
- `AgentState` (`src/include/types.ts:436`) sudah punya `currentPlan: TaskPlan` + `systemHealth.homeostasis` (computationalSuffering/Flourishing/cognitiveMode) → cocok untuk goal stack & self-model persisten.
- `DreamModule` (`dream-simulation`) & `MemoryConsolidationModule` sudah pakai `context.think` — pola ini akan diperluas (sudah terdaftar setelah fix orphan di commit `1cc08d1`).
- `AdaptiveLearningModule` (Q-learning) & `DreamIntegratorModule` (menghasilkan `dreamReward`) SUDAH terdaftar & reward loop SUDAH tersambung (lihat area #4).

## Batasan (keputusan user: HYBRID + ikuti setting provider)
- Modul AGI boleh panggil `context.think`, **tapi hanya modul kritis & hanya saat trigger terpenuhi** (bukan setiap turn).
- **Wajib ikut setting provider LLM user** (`settings.provider` + model dari config), SAMA seperti chat biasa. TIDAK ADA hardcoded provider/API key/model di kode modul AGI (AGENTS.md §5: no hardcoded fallback model).
- Pemilihan model powerful vs kecil **otomatis by trigger** (lihat #3), di atas provider yang sudah di-set user. Bila user pakai OpenRouter, reasoning AGI otomatis pakai OpenRouter (model powerful bila trigger berat).
- Default OFF lewat `configSchema` (opt-in) agar tidak mengubah behavior existing sampai diaktifkan di UI.

## Rencana Implementasi (5 area, urutan eksekusi)

### 1. Goal Stack persisten (`ProactiveVolitionModule` + `TopDownExecutiveControlModule`)
- Tambah `goals: GoalEntry[]` ke `AgentState` (atau simpan via `StorageService.getCustom('yui_goals')` agar tidak bengkak state).
- `TopDownExecutiveControlModule` (order tinggi, fase SOUL) menjadi **executive**: baca `goals`, pilih subgoal aktif, tulis ke `context.activeGoal` & `state.currentPlan`.
- `ProactiveVolitionModule` (fase SOUL) saat `state.status==='idle'` & energi cukup → generate niat proaktif, push ke `goals`, dan (jika `enableVolitionLLM`) pakai `context.think` untuk merumuskan niat naturalistik (hybrid).
- Validasi: goal yang selesai dibuang; goal stale (>24h) di-decay.

### 2. Modul AGI sebagai fase berpikir berulang (bukan sekadar pre-prompt)
- Tambah phase baru `ModulePhase` opsional `'AGI_REFLECT'` yang dijalankan **di dalam loop** `executeCortexThink` (setelah PHASE 2 COMPRESSION, sebelum gateway call tiap iterasi) — HANYA jika `config.yuiagi.enableLoopedReflection`.
- Di phase ini, `HighOrderMetacognitionModule` & `SelfAwarenessMirrorModule` dijalankan lagi per-iterasi untuk mengaudit hasil iterasi sebelumnya (bukan sekali di awal). Mereka update `context.soulDirective` berdasarkan `toolExecutionHistory` dari loop, bukan tebakan awal.
- Implementasi: panggil `SystemRegistry.runCortexPhase('AGI_REFLECT' as any, input, state, loopContext)` di dalam `while` loop (`cortexThinkEngine.ts:~326`), passing `loopContext` yang sudah berisi `toolExecutionHistory`.
- Aman: di-guard dengan config flag (default false) → tidak mengubah path existing.

### 3. Subkorteks mandiri via `context.think` (hybrid reasoning, ikuti setting provider)
- `context.think` diperluas signature: `think(prompt: string, opts?: { model?: string; jsonMode?: boolean })` yang **selalu lewat `provider-gateway` dengan `settings.provider` user** (persis seperti `thinkSimple` di `cortex.ts:184`, yang memanggil `gateway.run(prompt, state, { config: settings })`). Tidak ada hardcode provider/model (AGENTS.md §5).
- `configSchema` tiap modul kritis (`AbstractReasoningModule`, `HighOrderMetacognitionModule`, `NeuroSymbolicModule`, `ProactiveVolitionModule`):
  - `useLLMReasoning` (boolean, default false) — master switch.
  - `reasoningModelHeavy` (string, default = kosong → pakai model utama user dari `settings[provider].model`) — diisi model powerful (mis. `gemini-2.5-pro`/`claude-opus`/`gpt-4o`) bila user mau override khusus reasoning. Kosong = ikut setting chat.
  - `reasoningModelLight` (string, default = kosong → model utama) — untuk trigger ringan.
- **Pemilihan otomatis by trigger** (tidak perlu user pilih manual): modul hitung `complexity` dari input (panjang, keyword abstrak/filosofis, risiko tinggi dari `hallucinationRisk`). Bila `complexity > threshold` → pakai `reasoningModelHeavy` (atau model utama bila kosong); bila ringan → `reasoningModelLight`. Semua tetap di atas `settings.provider` user.
- Bila aktif & trigger terpenuhi → modul panggil `context.think(prompt, { model })` untuk menghasilkan reasoning asli, lalu suntik ke `soulDirective` (bukan cuma heuristic `Math.random`).
- `DreamModule` & `MemoryConsolidationModule` sudah pakai pola `context.think` → jadikan referensi. Pastikan `context.think` tersedia di SEMUA `runCortexPhase` call (PHASE 1/SOUL/COMPRESSION/AGI_REFLECT), bukan cuma di loop (`cortexThinkEngine.ts:1589`).

### 4. ~~Reward loop nyata~~ — SUDAH TERIMPLEMENTASI (ditarik dari rencana)
- Verifikasi `2026-07-17`: `AdaptiveLearningModule.run` (baris 106) **sudah membaca** `context.dreamReward`, dan `DreamIntegratorModule` (baris 46/51) **sudah men-set** `dreamReward`. Q-table persist ke `StorageService.getCustom('yuihime_q_table')`. TD-update berjalan delayed (pre-process order 2) — benar secara RL. **Tidak perlu diubah.**

### 5. Self-model yang memicu behavior sendiri (tanpa prompt user)
- `CircadianRhythmModule` & `YUIAGICoreModule` (homeostasis) sudah hitung energi/suffering. Tambah: bila `computationalSuffering > 75` atau `energy < 20` → modul set `state.status='dreaming'`/`'reflecting'` dan (via eventBus) picu `Cortex` autonomous pulse untuk menjalankan `DreamModule` (`SIMULATE_DREAM`) di background — **tanpa menunggu input user**.
- Gunakan `eventBus.emit('AGI:AUTO_DREAM', {...})` (eventBus sudah ada: `src/core/kernel/event-bus.ts`); `Cortex` sudah punya `startAutonomousPulse` (`cortex.ts:80`).

## File yang disentuh (estimasi)
- `src/include/types.ts` — tambah `GoalEntry` (atau simpan via StorageService, hindari ubah AgentState besar).
- `src/modules/agi/TopDownExecutiveControlModule.ts` — executive goal selection.
- `src/modules/agi/ProactiveVolitionModule.ts` — volition + optional LLM.
- `src/modules/agi/HighOrderMetacognitionModule.ts` — looped reflection + optional LLM.
- `src/modules/agi/SelfAwarenessMirrorModule.ts` — looped reflection.
- `src/modules/agi/AbstractReasoningModule.ts`, `NeuroSymbolicModule.ts` — optional LLM reasoning.
- `src/modules/agi/CircadianRhythmModule.ts`, `YUIAGICoreModule.ts` — auto-dream trigger via eventBus.
- `src/core/cortex/cortexThinkEngine.ts` — jalankan phase `AGI_REFLECT` di dalam while loop + pastikan `context.think` tersedia di semua phase.
- `src/core/registry.ts` — tambah `'AGI_REFLECT'` ke `ModulePhase` type jika perlu.
- `docs/archive/MODULES.md` + `UPDATE_LOG.md` — sync dokumentasi.

## Risiko & Mitigasi
- **Latensi/biaya**: semua fitur LLM di-guard `configSchema` default OFF. Saat aktif, reasoning ikut `settings.provider` user (sama seperti chat) — bila user set model powerful, AGI pakai itu; tidak ada hardcoded fallback (AGENTS.md §5).
- **Breaking loop utama**: phase `AGI_REFLECT` & auto-dream di-guard flag; path default tidak berubah.
- **Infinite loop**: auto-dream di-batasi cooldown (mis. 1× per 30 menit) via `lastDreamCycle` di state.
- **State bloat**: goal stack & Q-table via `StorageService.getCustom` (persisten di `.yuihime`), bukan di `AgentState` mentah.
- **Model tidak ada**: bila `reasoningModelHeavy` diisi tapi tidak didukung provider, fallback ke model utama user (biarkan gateway yang menangani error/fallback, jangan hardcode di modul).

## Validasi
1. `npm run lint` (tsc --noEmit) lolos.
2. Boot server, kirim chat biasa → behavior identik dengan sebelum perubahan (flag default OFF).
3. Aktifkan `enableLoopedReflection` + `useLLMReasoning` di config → chat dengan konsep abstrak → log menunjukkan modul AGI memanggil `context.think` (lewat `provider-gateway` + `settings.provider` user) & menyuntikkan reasoning ke `soulDirective` (cek `context.logs`). Pastikan tidak ada provider/model hardcode di kode modul.
4. (Reward loop sudah jalan sejak awal — verifikasi: `dreamReward` mengalir `DreamIntegratorModule` → `AdaptiveLearningModule`, Q-table persist di `StorageService.getCustom('yuihime_q_table')`.)
5. Turunkan energi/naikkan suffering → eventBus `AGI:AUTO_DREAM` terpicu, DreamModule jalan di background tanpa input user.

## Out of Scope
- Mengganti arsitektur single-LLM utama dengan multi-agent terdistribusi (terlalu besar, butuh sesi terpisah).
- Fine-tuning / training model nyata (AGENTS.md §5: model via config, bukan kode).
- Perubahan UI ModularSettings selain otomatis dari `configSchema` (sesuai AGENTS.md §3).
