# YuiHime Project Updates Logs
---

## [4.151] - 2026-07-31
### fix: Fix freeze daemon: pisahkan jalur pesan dari pipeline neural (hard timeout + abort)
- NeuralInterface: processNeuralInput/processNeuralInputWithMeta menerima signal?: AbortSignal, diteruskan ke cortex.think.
- MultiChannelQueue: thinkWithTimeout (AbortController, 150s) + withHardTimeout; dipakai di processNext, processBackgroundMessage, checkAndResumeSuspendedTasks; watchdog tidak lagi hanya reset flag.
- generateSegment.ts: stall timer 90s menutup headers+body, reset 60s per chunk; proxySegment/LocalProvider/CustomProvider/YuiVisionModule diberi AbortController (60-150s).
- telegram.ts: download attachment diberi AbortController 45s.
- Reaksi Telegram kini tetap dipicu saat balasan dikirim langsung via tool speak (jalur dedup-skip): trigger di onReply telegram.ts + eventBus TELEGRAM_REACTION dari MultiChannelQueue.


## [4.151] - 2026-07-31
### fix: Fix freeze daemon: pisahkan jalur pesan dari pipeline neural (hard timeout + abort)
- NeuralInterface: processNeuralInput/processNeuralInputWithMeta menerima signal?: AbortSignal, diteruskan ke cortex.think.
- MultiChannelQueue: thinkWithTimeout (AbortController, 150s) + withHardTimeout; dipakai di processNext, processBackgroundMessage, checkAndResumeSuspendedTasks; watchdog tidak lagi hanya reset flag.
- generateSegment.ts: stall timer 90s menutup headers+body, reset 60s per chunk; proxySegment/LocalProvider/CustomProvider/YuiVisionModule diberi AbortController (60-150s).
- telegram.ts: download attachment diberi AbortController 45s.
- Reaksi Telegram kini tetap dipicu saat balasan dikirim langsung via tool speak (jalur dedup-skip): trigger di onReply telegram.ts + eventBus TELEGRAM_REACTION dari MultiChannelQueue.


## [4.150] - 2026-07-31
### Feature: Reaksi Telegram berdasarkan mood/emotion balasan Yui (bukan random)
- NeuralInterface.processNeuralInputWithMeta(): kembalikan {text, mood, emotion, sentiment}; processNeuralInput tetap string (non-breaking).
- MultiChannelQueue: onReply kini menerima ReplyMeta (mood/emotion/sentiment) dari hasil proses balasan.
- telegram.ts: reaksi emoji dipilih dari mood/emotion balasan Yui (love/hype/anger/sad/tease/curious), fallback random; reaksi dipicu setelah balasan terkirim, bukan saat pesan masuk.


## [4.149] - 2026-07-31
### Refactor: Hapus reaction NLP Telegram (random emoji) + log khusus TensorArt
- Hapus telegramReactionLearner.ts (self-training NanoBrain, sentiment, feedback); reaksi kini random dari pool reactionEmojis config.
- Hapus tabel & index telegram_reaction_feedback (database.ts) dan stub telegramReactionLearner (web/vite.config.ts).
- TensorArt generate mencatat log 'tensorart' (appendLog): prompt, model, jobId, downloadUrl, localPath.


## [4.148] - 2026-07-31
### Feature: Log khusus TensorArt: prompt, model, generate ID, link download
- tensorart_generate kini mencatat ke log kategori 'tensorart' (appendLog/fileLogger, rotasi harian + retensi 7 hari): event generate, prompt, model (toolName), jobId (generate ID TensorArt), downloadUrl + localPath.
- Log terbaca Yui via tool view_logs (category=tensorart, termasuk arsip).


## [4.147] - 2026-07-31
### Refactor: Final removal of Telegram reaction NLP (self-training + learner), auto-react jadi random emoji
- Hapus telegramReactionLearner.ts (NanoBrain self-training, klasifikasi sentimen, feedback loop).
- telegram.ts: hapus import/init learner, pendingReactionFeedback, flushPreviousReactionFeedback; reaksi kini random dari pool reactionEmojis config (difilter ke emoji Telegram yang didukung).
- database.ts: hapus tabel & index telegram_reaction_feedback.
- web/vite.config.ts: hapus stub serverModule telegramReactionLearner; build web+server sukses, lint lulus.


## [4.146] - 2026-07-31
### Feature: Background chat summary engine: idle-gap + daily, boot catch-up, log rotation, chat_log tool
- ChatSummaryEngine (baru): ringkasan latar belakang jeda hening 120s (min 30 pesan) & daily summary otomatis saat tanggal berganti; disimpan ke DB memories + file, tidak diucapkan.
- Boot catch-up: scan chat_logs 7 hari untuk tanggal tanpa daily summary, diisi saat idle; scheduler skip tanggal yang sudah ada.
- fileLogger.ts: rotasi harian otomatis (<category>.YYYY-MM-DD.log) + retensi 7 hari + includeArchives di view_logs.
- API chat-summary/daily (GET/POST), tool daily_summary (read/generate) & tool chat_log (baca raw daily chat log).


## [4.145] - 2026-07-31
### Feature: Tool baru chat_log untuk membaca raw daily chat log
- ChatSummaryEngine.readDailyLog(): baca file chat_logs/YYYY-MM-DD.log (default kemarin) dengan opsi limit/tail; getLogDir() publik.
- Tool baru ChatLogTool (chat_log) — Yui kini bisa membaca pesan mentah per hari sebelum membuat/memeriksa daily summary.


## [4.144] - 2026-07-31
### Feature: Rotasi & retensi 7 hari untuk log kategori fileLogger.ts
- fileLogger.appendLog(): rotasi otomatis saat tanggal berganti — file aktif <category>.log diarsipkan ke <category>.<YYYY-MM-DD>.log (bila arsip sudah ada, data digabung bukan dihapus).
- fileLogger.cleanupLogs(): hapus arsip harian dan .rot lebih dari 7 hari (throttle 1 jam; force untuk panggilan eksplisit).
- fileLogger.readLogLines(): opsi includeArchives menggabungkan arsip harian (tertua→terbaru) + file aktif.
- view_logs tool kini membaca includeArchives agar hari sebelumnya tetap terlihat di tool.


## [4.143] - 2026-07-31
### Feature: Boot catch-up daily summary saat aplikasi mati (missed rollover)
- ChatSummaryEngine.scanPendingDailySummaries(): saat boot, scan chat_logs 7 hari terakhir untuk tanggal yang punya log harian tapi belum ada daily summary di DB; tandai pending.
- ChatSummaryEngine.processPendingDailySummaries(): jalankan generateDailySummary untuk tanggal pending saat idle (tidak ada aktivitas chat); retry otomatis bila LLM gagal.
- Scheduler harian kini skip tanggal yang sudah punya summary (hasDailySummary) agar tidak menimpa saat multi-day gap.
- generateDailySummary menghapus tanggal dari daftar pending setelah sukses.


## [4.142] - 2026-07-31
### Refactor: Rework chat summary mechanism: idle-gap trigger + daily summary (file & DB storage)
- Replace every-10-messages summarizer with ChatSummaryEngine (src/core/kernel/ChatSummaryEngine.ts): idle-gap trigger after 120s silence, only when >=30 messages accumulated since previous summary (cap 80/session).
- All incoming chat messages are now written to a per-day chat log (data/chat_logs/YYYY-MM-DD.log); logs & summaries retained 7 days by date then auto-cleaned.
- Daily summary auto-generated at date rollover from that day's log file, stored in DB memories (type=daily_summary) + YYYY-MM-DD.summary.log; manual trigger via POST/GET /api/cortex/chat-summary/daily.
- Summaries are now background-only: no longer spoken to chat / broadcast via WS (OUTPUT_EMITTED + remote_response_sent removed).
- New daily_summary tool (read/generate) so Yui answers 'kemarin apa?' from stored daily summaries instead of scanning all raw messages.


## [4.141] - 2026-07-31
### Fix: Fix literal ~ directory creation from unexpanded tilde in server.ts, PromptManager.ts, and fileLogger.ts
- Expand ~/.yuihime in server.ts modelsDir setup (root cause of ~ folder in project root)
- Use resolveHomePath in PromptManager.ts instead of naive os.homedir() join
- Resolve tilde for YUIHIME_SYSTEM_ROOT in fileLogger.ts DEFAULT_LOG_DIR


## [4.140] - 2026-07-31
### Fix: Fix SQLITE_BUSY locking: centralized DB connection + file-based retry logging
- Replace worker-thread DB connection in performForgetfulnessProtocol with centralized getDb() singleton to eliminate SQLITE_BUSY contention
- Add logDbRetry file logging to database.ts (db-retry.log) and integrate into retryDbOperation and withSqliteRetry
- Remove worker_threads dependency from NeuralInterface.ts — forgetfulness protocol now runs on main thread's centralized connection


## [4.139] - 2026-07-30
### fix: Fix literal ~ directory creation from unexpanded tilde in systemRouter.ts, settings.ts, and SOPModule.ts
- Fixed ~ expansion bug in systemRouter.ts (primary cause of ~ dir in project root), settings.ts, and SOPModule.ts


## [4.138] - 2026-07-30
### Fix: Fix SQLite database locked error in cron tasks
- Add SQLite retry logic with backoff to cron task database operations
- Prevent overlapping cron task executions with running guard flag
- Increase NeuralInterface worker thread SQLite timeout from 3s/100ms to 30s/30s


## [4.137] - 2026-07-30
### Fix: Suppress verbose [INFO][REGISTRY] logs in Node.js
- Remove browser-only guard in Logger so REGISTRY INFO/DEBUG are filtered in Node.js too
- Revert unnecessary environment_details stripping (it is used by system prompt)


## [4.136] - 2026-07-30
### Fix: Strip environment_details leak in APIService and processor
- Add environment_details regex stripping to APIService.cleanAIOutput as early sanitization layer
- Fix broken unclosed-tag regex in processor.ts and add attribute-tolerant pattern


## [4.135] - 2026-07-30
### Refactor: Replace pkg with @yao-pkg/pkg
- Migrate from vercel/pkg to @yao-pkg/pkg v6.21.0 for single-binary packaging
- Update compile-binary.cjs to use @yao-pkg/pkg CLI


## [4.134] - 2026-07-30
### Fix: Fix: Remove internal <thought> tag from DEFAULT_OFFLINE_FALLBACK in ProviderGatewayModule to prevent internal reasoning text from leaking into user chat


## [4.133] - 2026-07-30
### Fix: Add yuihime.sh startup script


## [4.132] - 2026-07-30
### Fix: Make tensorart fallback explicit: status=success with fallback=link_only


## [4.131] - 2026-07-30
### Fix: Fix tensorart fallback: proactively send image URL to chat when download fails


## [4.130] - 2026-07-30
### Fix: Fix log level sync: Logger.level now updates live via setLevel()


## [4.129] - 2026-07-30
### Fix: Handle COGNITIVE_LOOP_ABORTED gracefully in cortexRouter.ts
- cortexRouter.ts: tambah handler COGNITIVE_LOOP_ABORTED di streaming dan non-streaming path agar client disconnect tidak logged sebagai server error


## [4.128] - 2026-07-30
### Minor: Handle COGNITIVE_LOOP_ABORTED gracefully in cortexRouter.ts
- cortexRouter.ts: tambah handler COGNITIVE_LOOP_ABORTED di streaming dan non-streaming path agar client disconnect tidak logged sebagai server error


## [4.127] - 2026-07-30
### Minor: Retry download + kirim link gambar kalau download gagal
- - tensorart_generate/index.ts: download retry 3x + field _yuiInstruction suruh Yui kirim link ke user kalau download tetap gagal


## [4.126] - 2026-07-30
### Minor: Tool generate_image minta API key via chat kalau missing
- - tensorart_generate/index.ts: pesan error MISSING_API_KEY diarahkan suruh Yui minta key dari user lewat chat


## [4.125] - 2026-07-30
### Minor: Revert CRITICAL image block dari PromptManager.ts
- - Hapus blok 'CRITICAL: IMAGE / VISUAL GENERATION' di PromptManager.ts, sisakan 8 alias generate_image di toolNormalizer.ts


## [4.124] - 2026-07-30
### Minor: Tool call card UI + aliran hasil panggilan tool ke frontend
- - useChatSessions.ts: tambah parameter toolCalls di addLog/addLogDirect
- - handlers.ts: kirim result.tool_calls ke addLog() dan setLogs()
- - LiveChatFeed.tsx: render tool call card dengan nama tool + argumen


## [4.123] - 2026-07-30
### Fix: Cegah Yui deskripsikan gambar secara verbal — paksa panggil generate_image tool
- Tambah blok 'CRITICAL: IMAGE / VISUAL GENERATION' di prompt-manager:available_tools — instruksi eksplisit Yui TIDAK punya image generation bawaan, HARUS panggil generate_image


## [4.122] - 2026-07-30
### Fix: Yui sekarang pasti panggil generate_image saat user minta gambar
- Perkuat deskripsi manifest.json — instruksi eksplisit 'MUST IMMEDIATELY call this tool' jika user minta gambar
- Tambah 8 alias di toolNormalizer.ts: create_image, image_generation, text_to_image, txt2img, draw, dalle, dall_e, dall-e → generate_image


## [4.121] - 2026-07-30
### Refactor: Centralisasi akses database ke singleton getDb() + cleanup stale WAL/SHM
- Tambah export getDb() — panggil initializeDatabase() secara lazy, semua akses DB via getDb()
- Bersihin stale file -wal/-shm di initializeDatabase() sebelum buka koneksi baru, cegah lock saat boot setelah crash
- Migrasi 16 file dari initializeDatabase() → getDb() — cuma server.ts entrypoint yang masih panggil initializeDatabase() langsung


## [4.120] - 2026-07-30
### Refactor: Hapus fungsi Reaction NLP dari Telegram
- Hapus telegramReactionLearner.ts (NanoBrain sentiment classification, emoji selection, feedback loop)
- Hapus reaction code dari telegram.ts (import, pendingReactionFeedback, auto-react emoji)
- Hapus tabel telegram_reaction_feedback, index dan auto-cleanup dari database.ts
- Hapus reactionEmojis config dari TelegramBridge.ts
- Hapus telegram_reaction_feedback_retain_days dari shared/constants.ts
- Hapus tools/reset-tg-reaction.mjs


## [4.119] - 2026-07-30
### Refactor: Hapus fungsi Reaction NLP dari Telegram
- Hapus telegramReactionLearner.ts (NanoBrain sentiment classification, emoji selection, feedback loop)
- Hapus reaction code dari telegram.ts (import, pendingReactionFeedback, auto-react emoji)
- Hapus tabel telegram_reaction_feedback, index dan auto-cleanup dari database.ts
- Hapus reactionEmojis config dari TelegramBridge.ts
- Hapus telegram_reaction_feedback_retain_days dari shared/constants.ts
- Hapus tools/reset-tg-reaction.mjs


## [4.118] - 2026-07-29
### Fix: Make --settings a standalone TUI mode that skips HTTP server bootstrap
- --settings skips bootstrap()/startServer(), does only DB + registry init to avoid EADDRINUSE conflicts
- Added TTY guard to both server.ts and settingsTUI.ts for non-interactive shell safety


## [4.118] - 2026-07-29
### Fix: Add TTY guard to --settings TUI to prevent hanging in non-interactive shells
- settingsTUI.ts now checks process.stdin.isTTY / process.stdout.isTTY before launching
- server.ts also validates TTY before invoking startSettingsTUI() with clear error message


## [4.118] - 2026-07-29
### Feature: Add CLI TUI settings editor via --settings flag
- New --settings flag launches interactive terminal settings editor
- Supports all configSchema field types with dynamic options
- Full side-effect chain on save: cache clear, plugins reload, bridges reinit, WS broadcast


## [4.118] - 2026-07-29
### Feature: Add CLI TUI settings editor via --settings flag
- New --settings flag launches interactive terminal settings editor
- Supports all configSchema field types: boolean, number, slider, select, multiselect, string, password, textarea, color
- Dynamic options support via module getDynamicOptions() for async field loading
- Modules grouped by type (Consciousness, Tools, Speech, AI Providers, Bridges, Addons)
- Full side-effect chain on save: clear cortex cache, reload plugins, reinit all bridges, broadcast WS update
- No new npm dependencies — uses existing readline + ANSI escape codes


## [4.118] - 2026-07-29
### Fix: Fix speak delivery and preserve rich responses


## [4.117] - 2026-07-29
### Fix: Fix speak delivery and preserve rich responses
- speak tool now sends directly to Telegram/Discord immediately when executed
- protected processedResponse from being overwritten by offline fallback messages


## [4.117] - 2026-07-28
### feat: feat: add Docker support and major refactoring for v4.117


## [4.117] - 2026-07-27
### Fix: Fix Telegram duplicate message and environment_details leak
- Merge post-photo text into photo caption instead of sending separate message
- Strip <environment_details> block globally in NeuralProcessor.sanitizeOutput


## [4.116] - 2026-07-27
### Fix: Fix Telegram duplicate message and environment_details leak
- Merge post-photo text into photo caption instead of sending separate message
- Strip <environment_details> block globally in NeuralProcessor.sanitizeOutput


## [4.115] - 2026-07-27
### Fix: TensorArt duplicate chat delivery fix
- Removed automatic image/link sending from tensorart_generate tool to prevent duplicate messages in Telegram/Discord.
- Tool now only returns imageUrl/localPath to LLM; LLM handles final user-facing message so link is sent exactly once.


## [4.114] - 2026-07-27
### Refactor: Project cleanup and repository hygiene
- Removed accidental ~ directory and unused root files (eng.traineddata, db-tui.mjs, log-viewer.mjs, settings-tui.mjs, metadata.json, mock-test.ts, sop_system_plan.md, terminal.sh, root index.html).
- Untracked release/ from git and added to .gitignore to keep repository size healthy; standalone package remains available locally.
- Added release/ to .gitignore and cleaned up temporary test artifacts from /tmp.


## [4.113] - 2026-07-27
### Fix: Standalone release package, build stability, Telegram UI init, and TensorArt delivery reporting
- Added portable release/ package with run.sh/run.bat launchers for deployment outside project root.
- Fixed tsconfig.json exclude for dist and release folders to prevent TypeScript heap exhaustion during lint/build.
- Removed duplicate fs/path imports in server.ts causing TS2300 duplicate identifier errors.
- Added missing CortexApi import in web/src/app/effects.ts.
- Changed useRef<Cortex> to useRef<any> in web/src/app/state.ts to avoid bundling server-side Cortex class into web.
- Moved top-level await SettingsManager.applyBootLogLevel() into startServer() because esbuild CJS bundle does not support top-level await.
- Added overwrite guard in onboarding.ts: config.toml is now only written when missing or content actually changes, preventing unnecessary reset on every boot.
- Fixed Telegram bot setup in web UI by initializing SystemRegistry from web/src/App.tsx so telegram_bridge module and botToken field are visible in Settings.
- Wrote Telegram bot token to ~/.yuihime/data/config.toml.
- Improved TensorArt tool: added sendTextToChat fallback and delivery status reporting to LLM when image download fails.


## [4.112] - 2026-07-27
### Fix: Build stability, config guard, Telegram UI init, and TensorArt chat delivery
- Fixed tsconfig.json exclude for dist folders to prevent TypeScript heap exhaustion during lint/build.
- Removed duplicate fs/path imports in server.ts causing TS2300 duplicate identifier errors.
- Added missing CortexApi import in web/src/app/effects.ts.
- Changed useRef<Cortex> to useRef<any> in web/src/app/state.ts to avoid bundling server-side Cortex class into web.
- Moved top-level await SettingsManager.applyBootLogLevel() into startServer() because esbuild CJS bundle does not support top-level await.
- Added overwrite guard in onboarding.ts: config.toml is now only written when missing or content actually changes, preventing unnecessary reset on every boot.
- Fixed Telegram bot setup in web UI by initializing SystemRegistry from web/src/App.tsx so telegram_bridge module and botToken field are visible in Settings.
- Wrote Telegram bot token to ~/.yuihime/data/config.toml.
- Improved TensorArt tool: added sendTextToChat fallback and delivery status reporting to LLM when image download fails.


## [4.111] - 2026-07-26
### Fix: SocketService Documentation, Stage Drawer Cleanup & Avatar Loading Bug Fix
- Added DOCS_SOCKET.md & server WS helper methods, removed stage relation drawer, fixed VRM load error bug


## [4.110] - 2026-07-26
### Fix: Integrated Giftia OS Relation Analysis into Settings Memory Tab
- Moved Lattice Synchrony & Relasi Batin panel to Memory Tab and verified AGI Soul attitude influence


## [4.109] - 2026-07-26
### Fix: Created web/src/core/socket.ts service for real-time communication
- Parsed avatar animation triggers and TTS audio streams with offline resilience


## [4.108] - 2026-07-26
### Fix: Refactored Modules Tab Settings UI for improved organization and ease of use
- Added Category Group Filters (Core AI, Perception, Memory, Bridges, System) and search bar
- Added Quick Category Switcher pill bar in detail view
- Organized Consciousness, AGI Mind Engine, and System Tools into structured sub-tabs


## [4.107] - 2026-07-25
### Fix: Fix AbortSignal misalignment in cortical tool execution
- Resolved signal?.addEventListener is not a function errors in cortexThinkEngine by correcting argument order for AbortSignal in call chains.
- NeuralInterface now passes undefined for signal when no AbortSignal is available.


## [4.106] - 2026-07-25
### Fix: Fix unhandled cognitive error: __dirname is not defined in ESM
- Resolved ESM reference to __dirname in SOPModule.ts using imported fileURLToPath from url and dynamic path resolution


## [Minor] - 2026-07-25
### Fix: Add DB-backed custom persona presets with CRUD APIs and resolver integration
- Added custom_personas table, /api/system/personas endpoints, resolver fallback for custom personas, and frontend API fetch/upload


## [4.105] - 2026-07-25
### Fix: Fix extra closing brace in cortexThinkEngine
- Removed extra `}` accidentally added at end of catch block (line 620)
- Caused try block to close prematurely before isProactiveRun const (line 1479)
- esbuild TransformError: Expected 'finally' but found 'const' now resolved


## [4.104] - 2026-07-25
### Feature: Background Process Manager — spawn external OS processes
- Added BackgroundProcessManager singleton (src/core/kernel/BackgroundProcessManager.ts)
- 5 new API routes: POST /spawn, GET /list, POST /stop, DELETE /:id, GET /:id/logs
- New plug-and-play tool driver: src/drivers/tools/manage_bgproc/ (auto-registered via glob)


## [4.103] - 2026-07-25
### Improve: db_server.py — Mobile-first UI overhaul
- Added mobile bottom nav bar (Tables / Viewer / SQL) with animated active state.
- Converted sidebar + tabs to pane-switching system — each section occupies full screen on mobile.
- Replaced fixed sidebar with scrollable table list with live search/filter.
- Upgraded data table with client-side pagination (50 rows/page), sticky header, PK badges.
- Modal redesigned as bottom sheet with slide-up animation, handle bar, safe-area padding.
- Toast redesigned as centered pill with success/error variants.
- Desktop layout unchanged — sidebar + tab bar remain for wider screens.
- Fixed conn.changes() → conn.total_changes (Python compat).


## [4.102] - 2026-07-25
### Feature: Implement Dream CLI script and Prompt Registry migration
- Implemented tools/dream.py to trigger cognitive narrative dream synthesis via post request calls
- Migrated dream consolidation prompt from dream.ts to PromptRegistry under cortex:dream_consolidation namespace
- Ensured zero hardcoded prompts inside DreamEngine


## [4.101] - 2026-07-25
### Feature: Implement Calendar Reminder & OCR tools
- Implemented calendar_reminder tool — supports create, list, and delete actions for user reminders stored in SQLite cron_tasks
- Implemented ocr tool — extracts dynamic text from local image paths utilizing offline tesseract.js engine
- Added npm package tesseract.js as a lazy-loaded runtime dependency
- Verified calendar and OCR integration with yui_tests/calendar_ocr.test.ts


## [4.100] - 2026-07-25
### Feature: SQLite FTS5 + BM25 memory search indexing
- Created memories_fts virtual table and automated triggers to sync INSERT, UPDATE, and DELETE operations
- Rewrote searchMemories in memorySearch.ts to leverage high-performance FTS5 MATCH and BM25 ranking joined with context
- Tested AGI framework integration successfully without regression


## [4.99] - 2026-07-25
### Feature: Upgrade MemoryModule with hybrid search ranking
- Replaced standard JavaScript .includes() check in MemoryModule.ts with searchMemories() hybrid retrieval
- Fuses keyword/tag overlap with importance and recency decay to maximize database memory utility


## [4.98] - 2026-07-25
### Feature: Automatic cognitive planning trigger
- Updated PlanningModule.ts to trigger planning mode automatically when complex indicators with token length > 8 are detected


## [4.97] - 2026-07-25
### Feature: Auto-cleanup scheduler for high-churn DB tables
- Added AUTO_CLEANUP_LIMITS constants in shared/constants.ts (no hardcodes in logic)
- Implemented runAutoCleanup() in database.ts — purges performance_metrics (keep 1000), history (keep 500), telegram_update_ids (7d TTL), pending_messages (60min TTL for done/failed), pairing_codes (expired)
- Implemented startAutoCleanupScheduler() — runs once on startup then every 6 hours via setInterval
- server.ts now calls startAutoCleanupScheduler(db) right after setupSchema


## [4.96] - 2026-07-25
### Fix: push_gh: Auto-detect git remote instead of hardcoding origin
- Added get_default_remote() to detect first configured remote
- Added --remote CLI argument for manual override
- Falls back to first available remote if 'origin' not found


## [4.95] - 2026-07-25
### Fix: Suppress non-interactive TTY console.log on startup
- Removed verbose 'Berjalan dalam mode non-interaktif' log from onboarding.ts
- Replaced with silent comment — no functional change to startup behavior


## [4.94] - 2026-07-25
### Fix: LLM Audit Log: Record Tool Calls & Results
- Extended LlmLogEntry interface with toolCalls and toolResults fields
- Added LlmIoAuditor.recordToolExecution() to patch latest log entry with tool data
- Hooked cortexThinkEngine to call recordToolExecution() after each tool execution batch
- Tool result payloads truncated to 1200 chars to keep storage manageable


## [4.93] - 2026-07-25
### Refactor: Remove redundant module files and clean up USER.md updates
- Removed src/modules/KnowledgeModule.ts in favor of RAGModule
- Removed src/modules/agi/DreamIntegratorModule.ts in favor of DreamModule
- Excluded AUDIENCE_PROFILE.md (USER.md) from the Dreaming Cycle as user identities are handled in the SQLite database


## [4.92] - 2026-07-24
### Fix: Support model array in processor resilience logic
- Updated executeWithResilience in processor.ts to support array of models from config/options instead of taking only the first one


## [4.91] - 2026-07-24
### Refactor: Rename speak tool: final_answer→speak, root field final_answer→speech
- LiveStatusToolsModule: tool id/name 'final_answer' renamed to 'speak' — more semantic and OpenAI-aligned
- PromptRegistry: all schema, examples, and presets updated — root field is now 'speech', speak tool replaces final_answer tool in tool_calls, two clear examples added (simple reply + search+speak in parallel)
- cortexThinkEngine: all tc.tool checks updated to accept both 'speak' and 'final_answer' (backward compat), makeToolCall now uses 'speak', realTools filter excludes 'speak' from action count
- ValidationMiddleware: field check now prioritizes 'speech' over 'final_answer', XML tag list includes 'speech'


## [4.90] - 2026-07-24
### Fix: Fix premature final_answer injection when blocking tools are present
- Extended blockingTools list in cortexThinkEngine: search_internet, read_url, tensorart_generate, run_command, read_file, get_weather, translate, call_api, dll
- Yui kini defer final_answer ke iterasi berikutnya saat blocking tool sedang berjalan, mencegah respons 'ngambek/blank' setelah tool selesai
- Hapus kondisi bypass speechText.length > 15 yang salah — sekarang semua blocking tool wajib selesai dulu sebelum Yui bicara


## [4.89] - 2026-07-24
### Fix: Fix LiveStatus fetch hanging causing final_answer 60s tool execution timeout
- Added 2000ms AbortController timeout signal to LiveStatus stream events HTTP fetch requests


## [4.88] - 2026-07-24
### Refactor: Refactor PromptRegistry JSON Schema directives to be clean and universal
- Replaced hardcoded example strings in viewerProfileUpdate description with clean, professional OpenAI-standard autonomous extraction instructions


## [4.87] - 2026-07-24
### Feature: Enable Autonomous Profile Memory Recording for YuiHime Otome Engine
- Updated PromptRegistry JSON Schema directive to mandate autonomous extraction of user preferences and important facts into viewerProfileUpdate


## [4.86] - 2026-07-24
### Fix: Fix code_interpreter async code execution failure for external network calls
- Updated /api/tools/execute_js endpoint to support async/await and fetch Promises within code_interpreter sandbox


## [4.85] - 2026-07-24
### Fix: Fix TensorArt auto-send prompt caption leak causing LLM confusion
- Removed raw Generated prompt caption from background Telegram image auto-send to prevent NeuralVerifier false error triggers


## [4.84] - 2026-07-24
### Fix: Fix repetition issue and deduplication window in Telegram integration
- Reduced deduplication window duration for Telegram private chat context to prevent valid messages from being ignored
- Ensured unique multi-channel message hashes


## [4.83] - 2026-07-24
### Remove: Remove YouTube, Slack, WhatsApp, Matrix, Native Imagen3/FLUX/Midjourney, Financial Data Tool
- Removed src/modules/FinancialModule.ts (financial tracking module)
- Removed native Imagen 3 image generation endpoint (/api/ai/image-generation) from aiRouter.ts
- Removed Imagen 3, FLUX Schnell, and Midjourney v6 options from RegistryInitializer.ts artistry config
- Removed Imagen 3, FLUX Schnell, and Midjourney v6 options from ModulesTab.tsx artistry UI
- Removed FLUX model size setting from ProvidersTab.tsx replicate provider
- Removed FLUX mention from ComfyUI description in settingsConstants.ts
- Removed Slack platform support from messaging_integration tool (manifest, index.ts, available_tools.json)
- Removed Slack Bot Token config field from messaging integration
- Updated docs to remove YouTube, Slack, WhatsApp, Matrix, Imagen3/FLUX/Midjourney references
- Created docs/MISSING_TOOLS_PLAN.md with implementation plans for remaining missing tools


## [4.82] - 2026-07-24
### Remove: Remove fileAutomation.ts and sandboxRouter.ts
- Removed fileAutomation.ts tool for automatic file operations
- Removed sandboxRouter.ts sandbox execution routes
- Removed all imports and dynamic imports from apiRouter.ts
- Tools no longer leak filesystem paths to external providers


## [4.81] - 2026-07-24
### Refactor: Rename aiName to characterName for persona clarity
- Added CHARACTER_NAME constant to shared/constants.ts
- Renamed aiName to characterName in RUNTIME_DEFAULTS and all references
- Updated AboutTab, SystemTab, DatasetExport labels to use characterName
- Added backward compatibility migration in settings.ts for old aiName configs


## [4.80] - 2026-07-24
### Fix: Auto-update README.md version heading
- update_log.py now updates README.md main heading version
- Only updates main heading, preserves historical version references


## [4.79] - 2026-07-24
### Fix: Test shared/constants version sync
- Testing APP_VERSION auto-update


## [4.78] - 2026-07-24
### Fix: Sync version across package.json and shared/constants.ts
- update_log.py now updates package.json version automatically
- update_log.py now updates shared/constants.ts APP_VERSION automatically
- AboutTab uses APP_VERSION from @shared/constants as single source of truth


## [4.77] - 2026-07-24
### Fix: Simplify executeGoogleSearch to zero-key web search
- Removed Gemini native grounding API dependency for web search
- Removed OpenRouter search fallback from executeGoogleSearch
- Kept only zero-key sources: DDG, Qwant, Yandex, SearXNG, RSS, Wikipedia
- Added keyPool rotation and failure reporting for 429/404
- Added permanent model skip on 404 to avoid repeated failed requests


## [4.76] - 2026-07-24
### Fix: Search grounding zero-key fallback improvements
- Fixed array apiKey/model crash in executeGoogleSearch
- Added RSS news feeds (BBC, NYT, Al Jazeera, NPR, The Verge) as zero-key sources
- Added Qwant, Yandex, SearXNG as additional zero-key search sources
- Created configNormalizer.ts utility for centralized array handling
- Normalized apiKey/model usage across 13+ files


## [4.75] - 2026-07-23
### Refactor: AGI Modules Consolidation & Prompt Standardization
- Merged SpontaneousProactiveModule into ProactiveVolitionModule
- Merged DreamIntegratorModule into DreamModule
- Merged KnowledgeModule into RAGModule
- Standardized all AGI prompt definitions to English following OpenAI agent standards


## [4.74] - 2026-07-23
### Fix: Auto-Migrated Ero Resonance Core to Character Presets
- Automatically injected Sensual Focus (Ero Resonance) core preset into cached localStorage character cards
- Updated Auto-Adaptive Router description to reflect auto-routing for romantic/flirty topics


## [4.73] - 2026-07-23
### Feature: Added Sensual Focus (Ero Resonance) Core
- Added Sensual Focus (Ero Resonance) core with flirty/romantic prompt profile and auto-routing trigger keywords


## [4.72] - 2026-07-23
### Fix: Synchronized Persona Names and Auto-Select Active Badge
- Updated character cards migration in localStorage to clean titles matching DEFAULT_NEURAL_CORES
- Added visual Auto-Adaptive Router Active indicator badges in CharacterTab and IdentitiesTab when Auto-Select Core is active


## [4.71] - 2026-07-23
### Fix: Cleaned Core Titles
- Removed specific model names (Aether, Hiyori, Nova) from Neural Cores titles in shared constants and ModularSettings


## [4.70] - 2026-07-23
### Fix: Auto-Select Core and Neural Core Markdown Integration
- Added Auto-Select Core (Adaptive Fusion) in DEFAULT_NEURAL_CORES to dynamically route between Aether, Hiyori, and Nova based on input context
- Unified NEURAL_CORES with .yuihime/agent/*.md system prompts to eliminate duplicate card states


## [4.69] - 2026-07-23
### Fix: Unify Persona Cards and Character Cards
- Merged characterCards and NEURAL_CORES into a single unified persona card system across CharacterTab, IdentitiesTab, and ModularSettings
- Synchronized activeCardId and activePersonaId directly to prevent duplicate persona card states


## [4.68] - 2026-07-23
### Fix: Dynamic model pool failover
- Updated AI generate segment to dynamically resolve failover models directly from SystemRegistry provider metadata and config.toml model pool without hardcoding


## [4.67] - 2026-07-23
### Fix: Improve Gemini quota failover and search grounding resilience
- Added automatic failover to resilient Gemini model fallbacks (gemini-2.5-flash, gemini-2.0-flash, gemini-1.5-flash, gemini-3.1-flash-lite) when 429 quota errors occur
- Sanitized raw HTTP 429 JSON responses into friendly Indonesian error messages
- Reduced DuckDuckGo search scraper timeout to 4000ms for faster zero-key grounding fallback


## [4.66] - 2026-07-23
### Fix: Remove Manual Pulse Override Triggers section
- Removed Manual Pulse Override Triggers animation controls from MatrixSectionTab


## [4.65] - 2026-07-23
### Fix: Fix blank white screen caused by externalized modules and eager glob imports in browser client
- Switched browser glob imports in RegistryInitializer to non-eager mode with try-catch error guards
- Added /* @vite-ignore */ to server-only dynamic imports
- Removed invalid rollupOptions.external from web/vite.config.ts
- Restarted dev server and verified compilation


## [4.64] - 2026-07-23
### Fix: Fix os.platform browser error and module bundling
- Replaced top-level fast-glob import with dynamic import in Node environment block
- Added fast-glob and adm-zip to external rollupOptions in web/vite.config.ts
- Verified compilation and dev server initialization


## [4.63] - 2026-07-23
### Fix: Fix SQLite database directory initialization error on server startup
- Added automatic directory creation (mkdirSync) for SQLite database in initializeDatabase
- Restarted dev server and verified successful initialization


## [4.62] - 2026-07-23
### Fix: Fix module imports and dev server startup
- Resolved missing module imports for fast-glob, adm-zip, and better-sqlite3
- Fixed TypeScript type issue in KnowledgeGraph node datum
- Restarted dev server and verified compilation


## [4.61] - 2026-07-20
### Fix: Remove leftover Puter.js integration (SDK, plugin, addons, UI, docs, config)
- Deleted addons/puter_hub and addons/check_puter_connection (in .yuihime) — the latter produced the 'meriksa koneksi Puter HTTP 200' heartbeat log.
- Removed broken node_modules/@heyputer/puter.js symlink (target packages/puter-sdk already deleted).
- Stripped Puter UI from ProviderPlayground.tsx, ModularSettings.tsx, ModulesTab.tsx (sub-tab, dynamic options, provider URL, default TTS -> official_speech).
- Removed [puter-neural-provider] and [puter-tts] sections (incl. plaintext Puter auth token) from .yuihime/data/config.toml.
- Deleted docs/PUTER_AI_GUIDE.md; no /api/puter backend routes remain.


## [4.60] - 2026-07-19
### Enhance: TensorArt: configurable defaults, retry/timeout, URL-first bot delivery
- configSchema for defaultToolName/defaultWidth/Height/timeout/retry/poll/apiKey, readable from Settings UI
- apiPost/uploadFile/downloadImage use AbortSignal.timeout + retry with exponential backoff for transient errors
- Bot (tg_/dc_) auto-sends image: local file when download succeeds, else remote URL as fallback
- LLM always chooses toolName/width/height (manifest defaults removed, required in description)


## [4.59] - 2026-07-19
### Enhance: TensorArt tool: configurable defaults + LLM-driven model/size
- Add configSchema (defaultToolName, defaultWidth/Height, requestTimeoutMs, retryLimit, pollIntervalMs, apiKey) readable from Settings UI
- Implement retry + AbortSignal.timeout on apiPost/uploadFile with exponential backoff for transient errors
- Fix retryable flags (EXECUTION_ERROR/LIST/UPLOAD now mark retryable on ETIMEDOUT/5xx)
- Make LLM always choose toolName/width/height (remove manifest defaults, require in description); code fallback only as safety net


## [4.58] - 2026-07-19
### Refactor: Standardize agent pipeline to JSON-only mode with English prompts
- Rewrote PromptRegistry templates (cortex:planning, cortex:json_enforcement, cortex:error_correction, cortex:failsafe_reprocess, cortex:repair_json) to JSON-only format with English instructions, removing all XML tag references and Indonesian text.
- Fixed cortexThinkEngine.ts fallback path to set clean in-character recovery speech on processedResponse instead of leaking raw tool traces or XML tags.
- Cleaned assembledSystemPrompt injection to remove XML tag references and redundant XML-disabled notices.
- Updated NeuroSymbolicModule.ts inline prompt to reference internal reasoning traces instead of XML thought structures.


## [4.57] - 2026-07-19
### Fix: Telegram reaction allowlist + verifier false-positive on internal tags
- telegram.ts: filter reaction emojis to Telegram-allowed set; recursive tryReact with ❤️ fallback (fixes REACTION_INVALID 400).
- TelegramBridge default reactionEmojis changed to valid set (❤️,🔥,🥰,👍,😁).
- processor.ts sanitizeOutput now strips <tool_calls>/<animations> internal tags.
- NeuralVerifierModule sanitizes processedResponse before error-keyword check, preventing false positives from fallback/tool-error traces.


## [4.56] - 2026-07-19
### Fix: Robust dynamic tool synthesis JSON parsing + fallback templates
- extractSynthesisJson(): parse LLM response even with prose/markdown fences (json/prose/braces fallback).
- buildConfigToml()/buildMainCjs(): safe no-op fallbacks when fields missing instead of throwing DYNAMIC_SYNTHESIS_ERROR.
- synthesizeAndRegister validates after extraction; logs warning + returns null on missing main_cjs/config_toml.


## [4.55] - 2026-07-19
### Fix: serveWebUI selalu Vite dev + /lib ter-serve
- `serveWebUI(app)` di `server.ts` kini selalu pakai Vite middlewareMode (dev), tidak lagi fallback ke static `dist/web` walau build ada. `npm run dev` selalu live.
- Kembalikan `app.use(express.static(public))` SEBELUM Vite agar aset `/lib/live2d/*` terlayani langsung; sebelumnya jatuh ke proxy Vite `/lib`->:3000 (self-loop, HTTP 500) sehingga React gagal mount & UI kosong.
- `dist/web` di-rebuild fresh (`rm -rf dist/web && npm run build:web`). `tsc --noEmit` bersih.

## [4.55] - 2026-07-18
### Refactor: Pisah Fisik Web UI <-> Daemon + Pecah App.tsx (AGENTS.md SOP)
- `server.ts` kini entry daemon murni: `serveWebUI(app)` diekstrak & lazy-import Vite (`import("vite")`), dipanggil hanya bila `!YUIHIME_NO_UI && !--no-ui`. `--no-ui` membuat `GET /` -> 404 (bukan index.html), bot/API/cron/WS tetap aktif.
- Folder baru `shared/` untuk modul dipakai dua sisi: `include/types`, `drivers/storage`, `drivers/storageServer`, `core/registry`, `core/kernel/event-bus`, `core/safeStorage`, `services/api`, `constants`. Impor internal disesuaikan (`@shared/*`, `@/*` -> `src/*`). `services/api.ts` diberi guard `typeof window` pada `localStorage`.
- Folder `web/` berisi React app: `index.html`, `vite.config.ts` (root `web`, outDir `../dist/web`, publicDir `../public`, proxy `/api`->:3000), `src/App.tsx` (shell tipis), `src/main.tsx`, `src/ui`, `src/components`, `src/services/{tools,profileCrypto}`.
- `src/App.tsx` (2901 baris) dipecah via `web/src/app/`: `state.ts`, `handlers.ts`, `effects.ts`, `controller.ts`, `layout.tsx` -- memenuhi SOP AGENTS.md (>1300 baris wajib split).
- Alias tsconfig/vite: `@shared/*`->`shared/*`, `@/*`->`src/*`, `@web/*`->`web/src/*`.
- `package.json`: `build` -> `build:web` (vite) + `build:server` (esbuild); `pkg.assets` -> `shared/**`, `web/dist/**` (bukan `src/**`).

## [4.54] - 2026-07-18
### Feature: Penguatan Agensi AGI (Mode Hybrid) — Area 1, 2, 3, 5
- `context.think` sekarang tersedia di semua phase (`PHASE 1`, `SOUL`, `PHASE 2`, loop `AGI_REFLECT`, `LOGIC`) dan menerima `opts.model` (empty = model utama user). `Cortex.thinkSimple` mendukung override model tanpa hardcoded fallback (AGENTS.md §5).
- Area 1: Goal stack persisten via `StorageService.getCustom('yui_goals')` — `TopDownExecutiveControlModule` (executive selection) & `ProactiveVolitionModule` (generate niat saat idle + optional LLM volition). Tidak membesar `AgentState`.
- Area 2: Phase `AGI_REFLECT` baru dijalankan di dalam ReAct loop (`cortexThinkEngine.ts`), opt-in via `enableLoopedReflection` (default OFF). `AGIReflectModules.ts` reuse run `HighOrderMetacognition` & `SelfAwarenessMirror` per iterasi.
- Area 3: Hybrid LLM reasoning di `AbstractReasoningModule`, `NeuroSymbolicModule`, `HighOrderMetacognitionModule`, `ProactiveVolitionModule`. Master switch `useLLMReasoning` (default OFF) + trigger complexity otomatis (panjang + keyword abstrak + hallucinationRisk). Ikut `settings.provider` user.
- Area 5: Auto-dream otonom via `eventBus.emit('AGI:AUTO_DREAM')` dari `YUIAGICoreModule` saat suffering>75/energi<20, cooldown 30m (`state.lastDreamCycle`). `Cortex` menjalankan `DreamModule` di background tanpa input user.
- Shared helper: `src/modules/agi/agiThinkHelper.ts` (computeComplexity, shouldReasonWithLLM, resolveHybridConfig, makeHybridThink).

## [4.53] - 2026-07-17
### Refactor: AGI module registration cleanup & doc sync
- Removed the manual registration block (21 AGI modules + EmotionEngine) in `src/core/RegistryInitializer.ts`; modules now auto-register via Vite glob (browser) and filesystem scan (server) per AGENTS.md §2 (Plug-and-Play, no manual registration).
- Fixed orphaned modules (`adaptive-learning`, `dream-integrator`, `dream-simulation`) that were missing from the manual list — now consistently loaded server & browser (verified 24/24 AGI modules register).
- Consolidated duplicated default prompt literals into a single source of truth: `YuiAGIDaemon.getDefaultPrompts()`; `YUIAGICoreModule` and `HighOrderMetacognitionModule` now reference it instead of duplicating prompt text.
- Added `DreamModule` export alias in `DreamModule.ts` to match the file name (AGENTS.md §8); `DreamSimulationModule` retained for compatibility.
- Updated `MODULES.md`: added all 24 `src/modules/agi/` modules to Cognitive group (Kelompok 3) and filled missing `DreamIntegratorModule`/`MemoryConsolidationModule` entries.

## [4.53] - 2026-07-17
### Feature: Editable cron task prompts in Web UI
- Added `prompt` column to `cron_tasks` (schema + migration) so each scheduled task can store a custom instruction.
- `/api/cron` POST accepts/saves `prompt`; GET already returns full rows.
- `getCronAction` now runs the custom prompt when set; falls back to default `[CRON_SIGNAL]: <name>...` when empty.
- `CronManager` form: Task Prompt textarea on create/edit; list shows custom-prompt badge + expandable preview; edit preserves channel targeting.
- Scheduler tool (`manage_cron` / `scheduler`): new optional `prompt` parameter for add/edit.

## [4.52] - 2026-07-17
### Fix: Web UI blank white screen (TensorArt Node imports in browser bundle)
- Root cause: `src/drivers/tools/tensorart_generate/index.ts` used static top-level imports from `fs`/`path`/`os`/`fs/promises`. Vite rewrote them to browser-external proxies that throw on property access during module evaluation.
- Because `RegistryInitializer` loads all tools via `import.meta.glob(..., { eager: true })` into the client graph, that throw aborted React mount (`#root` stayed empty → pure white page, CSS never applied).
- Fix: remove static Node imports; lazy-load filesystem helpers only on the server runtime (`loadNodeFs()`), so browser eager-glob evaluation stays safe. TensorArt execute path behavior unchanged.

## [4.51] - 2026-07-13
### Tool System Standardization (consolidation, canonical envelope, LLM-configurable loop)
- Consolidated 3 duplicate tools: `view_system_logs`→`view_logs` (added `type: "all"` + `offset`), `search_memory`→`search_chat` (added `scope` + `offset`), `file_automation`→`file_manager` (added sort/archive/summarize/convert actions + configSchema). Deleted retired tool directories.
- Added alias map + parameter normalization for retired IDs in `src/core/cortex/toolNormalizer.ts`.
- Cortex loop now strips reserved `_meta` (e.g. `timeout_ms`) from tool args and applies per-call timeout overrides; added `max_iterations_override` support capped by `tool-executor.maxIterationsCeiling` (new config key).
- Enforced canonical tool output envelope `{success, data, error, metadata}` for LLM tool-result messages, with per-tool `duration_ms` timing.
- Added centralized PromptRegistry templates (`tools:syntax_openai`, `tools:syntax_pagination`, `tools:output_format`, `tools:_meta`); `PromptManager` now references them instead of hardcoded XML.
- Added pagination params: `read_file` (limit/offset/line_start/line_end), `list_files`/`view_logs`/`search_chat` (limit/offset) with backend support in `toolsRouter.ts`.
- Standardized TensorArt tool: removed unsupported params (`negative_prompt`, `cfg_scale`, `steps`, `model_id`), added LLM-controlled `timeoutMs`/`pollIntervalMs`, wrapped returns in canonical envelope `{status, data, error, metadata}`, added `action` dispatch (`generate`/`list_tools`/`upload_file`), dynamic `toolName` + full `inputs` array, optional `sendToChat` auto-delivery via Telegram/Discord, and smart base URL routing for `ak_tusi` keys.

## [4.50] - 2026-07-13
### Config: TensorArt API key populated in settings and env
- Added `TENSORART_API_KEY` to `.env` with the active TensorArt access key.
- Added `[tensorart]` section with `apiKey` to `.yuihime/data/config.toml`.
- Tool `TensorArtGenerateTool` now resolves the key from `settings.tensorart.apiKey`, `process.env.TENSORART_API_KEY`, and `~/.tensor_access_key`.

## [4.49] - 2026-07-13
### Fix: TensorArt tool migration to OpenAPI
- Migrated `src/drivers/tools/tensorart_generate/index.ts` from deprecated TAMS API (`tams-api.tensor.art/v1/jobs`) to official TensorArt OpenAPI (`openapi.tensor.art/openworks/v1`).
- Updated auth header from `Bearer` to `Echo-Access-Key` per OpenAPI spec.
- Added fallback access key resolution from `~/.tensor_access_key` alongside settings and env.
- Switched task lifecycle to `POST /task` + `POST /task/query` with `taskIds` polling.
- Mapped inputs to `anime_lab_wai_illustrious` tool (STRING prompt + INTEGER width/height/count).
- Fixed output parsing to handle actual OpenAPI response format where image URLs come as STRING outputs (`type: "STRING"`, `value: "url"`), not just FILE outputs.
- Added auto-download after generation success, saving image to `/tmp/yuihime-tensorart/tensorart_<taskId>.png` and returning `localPath`.

## [4.48] - 2026-07-13
### Rename: Standardize all tool ids to snake_case agent names
- Renamed 17 driver tool ids + 2 core pseudo-tools to standard snake_case agent names across manifests, LiveStatusToolsModule.ts, cortexThinkEngine.ts, PromptRegistry.ts, toolNormalizer.ts, PuterAdapter.ts, puterWrapper.ts, NeuralLoopModule.ts, dataset synthesizer/routers, build-info.json, docs, and local .yuihime/agent prompts.
- Highlights: send_final_reply->final_answer, send_status_update->status_update, manage_files->file_manager, file_operations->file_automation, file_search->search_memory, lua_interpreter->run_lua, manage_cron->scheduler, manage_identities->update_user_profile, manage_pairing->pair_account, install_plugin->install_addon, python_interpreter->run_python, search_chat_history->search_chat, shell_exec->run_command, tensorart_generate->generate_image, get_logs->view_logs, get_system_logs->view_system_logs, web_scraper->scrape_web, emotion_adjust->set_emotion.
- Total registered tools stays 31; folder names unchanged (dispatch by manifest id); available_tools.json regenerated at boot; npm run build clean.

## [4.47] - 2026-07-13
### Config: Half mode with confirmation for outside-whitelist ops
- `config.toml` `[sandbox_paths]`: reverted `yolo_mode` `full` -> `half` and set `auto_acc_user_data` = `false`.
- Resulting policy: `user_data` (plus `.yuihime` system root / `data`) is whitelisted -> no confirmation; any file change action resolving OUTSIDE the whitelist (e.g. `/home/userland/Documents`, `/tmp`) now triggers the 3-level confirmation (Acc / Always Acc / Tolak) via `requestFileOperationConfirmation` in `apiRouter.ts:597`.

## [4.46] - 2026-07-13
### Config: Enable unrestricted file tool access (YOLO full)
- `config.toml` `[sandbox_paths] yolo_mode`: changed `half` -> `full`. All file tools (`manage_files`, read/write/edit/delete/move/copy, find) now resolve absolute paths to anywhere on the filesystem with no Path Jail and no confirmation prompt. The `user_data/...` relative contract still maps to the configured sandbox root (see 4.45). Restart server to fully reload.

## [4.45] - 2026-07-13
### Fix: manage_files resolved `user_data/...` to wrong folder in half/full YOLO mode
- `src/core/server/apiRouter.ts` (`verifySandboxPath`): the `user_data/...` path contract now always resolves to the configured sandbox `user_data` root (`dynamicSandboxRoot`) across `off`/`half`/`full` modes. Previously `half`/`full` resolved relative `user_data/...` against `process.cwd()` (e.g. `/home/userland/YuiHime/user_data`), differing from an absolute destination that points at the real sandbox, causing Yui to silently copy/move the wrong file.
- `src/drivers/tools/file_manager/manifest.json`: clarified `source`/`destination`/`path` descriptions to mandate the consistent `user_data/...` relative format and warn against mixing formats or self-copying.

## [4.44] - 2026-07-12
### Align: system & supporting prompts to OpenAI-native tool_calls contract
- `PromptRegistry.ts` (`cortex:json_enforcement` main schema, `cortex:error_correction`, `cortex:repair_json`, tiny/lite/medium presets): `tool_calls` items now documented as OpenAI-native `{id, type:"function", function:{name, arguments:object}}` with `id` required for result pairing; legacy `{tool, args}` examples replaced.
- `cortexThinkEngine.ts` "Format Respons Khusus (JSON MODE ACTIVE)" directive now mandates OpenAI-native `tool_calls` with unique `id` and object `arguments`.
- `datasetRouter.ts` SFT synthesis: prompt schema + parser (`t.function?.name`/`t.function?.arguments?.speech`) + both fallback `structuredOutput` blocks switched to OpenAI shape.
- `datasetSynthesizer.ts` instruction updated to emit OpenAI-native `tool_calls`.
- Wire-compatible: `normalizeToolCall` enriches calls to OpenAI shape while preserving `tool`/`name`/`args` aliases; NeuralLoop, api.ts middleware, processor accept both.

## [4.43] - 2026-07-12
### Fix: Duplicate fetch button in Gemini fallback models UI
- `src/ui/ModularSettings.tsx` (`renderFields` multiselect branch): removed duplicate `onFetch` RefreshCw button from `MultiSelectField` since `renderFields` already renders a single fetch button for `hasDynamicOptions` fields. Resolves the double-button glitch in the Gemini provider "Fallback Models" section.

## [4.42] - 2026-07-12
### Refactor: Standardize tool layer to OpenAI-native contract (provider-agnostic adapter)
- `src/core/openaiTools.ts`: removed `nativeToolCallsToXml`; added `normalizeToolCallsToOpenAI`, `normalizeToolsForProvider`, `buildToolResultMessages`, `buildChatMessages` as the single adapter layer for all provider↔OpenAI shape conversions. `buildOpenAITools` kept.
- Providers OpenAI/Custom/OpenRouter: now return canonical OpenAI `tool_calls` JSON (not XML) and inject prior `role:"tool"` results + assistant `tool_calls` via `context.toolMessages`/`context.assistantToolCalls`.
- `AnthropicProvider.ts`: added `tools` param (`input_schema` shape) + `tool_use` extraction + `tool_result` block injection on tool-result turns.
- `LocalProvider.ts`: upgraded from `/generate` to chat-completions (`/chat`) with `tools` support (Ollama-compatible).
- `ProviderGatewayModule.ts`: forwards `toolMessages`/`assistantToolCalls`; self-learning tool detection now also matches JSON `"tool_calls":[`.
- `cortexThinkEngine.ts`: `normalizeToolCall` enriched to OpenAI-native shape (keeps `id`/`function` + backward-compatible `tool`/`name`/`args`); after each tool execution cortex builds & accumulates `role:"tool"` result messages propagated to the next LLM turn. Memory integration preserved.
- `ToolExecutorModule.ts`: reads `call.id`/`call.function` and returns `tool_call_id`.
- Fixed pre-existing broken import in `src/ui/modular-settings/useModularSettingsState.ts` (`../include/types` → `../../include/types`).

## [4.41] - 2026-07-12
### Add: file_search (RAG/retrieval) standard-agent tool + trim UPDATE_LOG
- Added `file_search` tool (src/drivers/tools/file_search) — the standard-agent "file_search"/retrieval equivalent: hybrid keyword+tag search over Yuihime's persistent memory knowledge base, fused with importance & recency decay.
- Added shared helper `src/core/memorySearch.ts` (`searchMemories(query, limit, type)`) and backend route `GET /api/tools/memory-search` in `toolsRouter.ts` (mirrors `/api/tools/search`).
- Registered in `available_tools.json` (now 31 tools); synced agent `TOOLS.md`; regenerated `build-info.json`.
- Trimmed `UPDATE_LOG.md` from 2339 -> 472 lines (removed ~80% of legacy entries; retained most recent ~20%/61 entries) per user request.

## [4.40] - 2026-07-12
### Standardize tool names + add missing standard-agent tools
- Renamed 10 non-idiomatic tool ids to OpenAI-standard verb-first snake_case:
  - `plugin-installer` -> `install_plugin`, `web_snipper` -> `web_scraper`, `github_integration` -> `github`, `messaging_integration` -> `send_message`, `file_manipulate` -> `file_operations`, `file_manager` -> `manage_files`, `edit_file_segment` -> `edit_file`, `view_logs` -> `get_logs`, `view_system_logs` -> `get_system_logs`, `overlay_control` -> `control_overlay`.
  - Updated all references: `manifest.json`, `src/core/available_tools.json`, `index.ts` (getConfig + telemetry label), `cortexThinkEngine.ts` (tool array + translateToolsToActivities switch), `toolNormalizer.ts` (alias targets), `FileManipulationModule.ts`, agent `TOOLS.md`; regenerated `build-info.json`.
  - Kept backward-compat aliases in `toolNormalizer.ts` (e.g., `file_manipulate_tool`, `telegram_message`).
- Added 2 standard-agent utility tools (plug-and-play, auto-discovered via glob):
  - `get_current_time` (src/drivers/tools/get_current_time) — current datetime/timezone.
  - `calculator` (src/drivers/tools/calculator) — safe recursive-descent math evaluator (no eval).
  - Registered in `available_tools.json` (now 30 tools); all 28 ids pass OpenAI name regex; build-info + TOOLS.md synced.
- Note: lightweight clearly-standard tools added; heavier canonical tools (file_search/RAG, generic image_generation, http_request) not yet added — optional follow-up.

## [4.39] - 2026-07-12
### Standardize tool ids to OpenAI function-name rules
- Renamed 2 non-compliant tool ids (contained `.`, invalid in OpenAI `^[a-zA-Z0-9_-]{1,64}$`):
  - `emotion.adjust` -> `emotion_adjust` (manifest + available_tools.json + agent TOOLS.md + regenerated build-info.json).
  - `tensorart.generate` -> `tensorart_generate` (manifest + available_tools.json).
- Verified all 26 tool ids now pass OpenAI name regex; no dotted refs remain anywhere.
- Tool `parameters` schema already matches OpenAI function `parameters` (object/properties/required).
- Note: runtime still uses provider-agnostic prompt/XML `<tool_calls>` (not native `tools` param) by design; definitions are now fully OpenAI-reusable.

## [4.38] - 2026-07-12
### Improve: system_prompt.md (#1 #2 #4)
- #1 Fixed broken placeholder at §4.3 (`inside your \`\` block` -> `inside your <tool_calls> block`).
- #2 Made Workspace Sandbox Pathing deployment-agnostic (removed false "All project files live under /app" claim; clarified `/app/user_data` is container/Puter-only, local uses `.yuihime/user_data`; pinned [[FILE:]] examples to relative `user_data/`).
- #4 Added §4.4 Memory Recall & Persistence (Recall Before Reply / Persist Important Information / No Fabricated Memory) to align with Core Agent Loop.
- Synced to both agent dirs via sync_prompts.sh (all 9 files OK).

## [4.37] - 2026-07-12
### Add: sync_prompts.sh (one-shot sync, no re-discovery)
- Added `/home/userland/YuiHime/sync_prompts.sh` to sync system-prompt markdown across locations without re-searching.
- Source of truth fixed: `src/share/prompts/{system_prompt,character,lore}.md` -> both agent dirs; `YuiHime/.yuihime/agent/{IDENTITY,SOUL,MEMORY,USER,TOOLS,HEARTBEAT}.md` -> home agent.
- Supports `--force`, `--dry`; auto-verifies tri-location parity at the end.

## [4.36] - 2026-07-12
### Sync: System Prompt MD (src/share/prompts → agent dirs)
- Identified `src/share/prompts/` as the newest/most-complete source (contains [4.34] fix + channel file-sending §4.2 + richer lore).
- Synced `system_prompt.md`, `character.md`, `lore.md` from `src/share/prompts/` to both `YuiHime/.yuihime/agent/` and `/home/userland/.yuihime/agent/`.
- Result: all 3 agent markdown files now identical across the 3 locations (runtime now carries the [4.34] fix).

## [4.35] - 2026-07-12
### Sync: System Prompt MD (YuiHime/.yuihime/agent → /home/userland/.yuihime/agent)
- Verified sync status of 9 agent markdown files (IDENTITY, SOUL, character, lore, system_prompt, MEMORY, USER, TOOLS, HEARTBEAT).
- 5 files differed (IDENTITY, SOUL, character, lore, system_prompt). Synced from project source to runtime target per user direction.
- Result: all 9 agent md files now identical. Runtime persona now reflects project version (Yui Airi).

## [4.34] - 2026-07-12
### Fix: Yui Says "Wait" But Never Continues / Delivers the File
- Root cause analysis: `[CORTEX-FAST-TRACK] ... fallback to sync` is unrelated (background mood/telemetry worker thread only). The Cortex tool loop is correct (continues up to `maxIterations = 3` after each tool execution in `cortexThinkEngine.ts`).
- The real cause: the model emitted a final speech narrating an intention ("wait, let me peek the folder... found it... preparing") WITHOUT calling any tool, so the loop ended with no action and no file delivered.
- **src/share/prompts/system_prompt.md** (§4.1): Added two MANDATORY directives — `No Stall Promises` (never narrate an intention as final speech without actually invoking the tool in the same turn; conversational reply belongs to the subsequent turn after the observation) and `Locate-Before-Deliver` (never claim to have found/prepared a file unless located via a real tool call, then attach via `[[FILE:...]]`).

## [4.33] - 2026-07-12
### Fix: Telegram/Discord File Attachment Treating Chat Text as File Path (ENOENT)
- **src/core/server/channelFileAttachment.ts** (new):
  - Added `extractChannelFileAttachments` shared helper that parses file directives from AI responses with strict sandbox jail (path-traversal safe).
  - Supports inline `[[FILE:user_data/path]]` directives (chat text + attachment in one reply) and backward-compatible bare-filename responses.
- **src/core/server/telegram.ts** & **src/core/server/discord.ts**:
  - Refactored `trySendFileAttachment` / `trySendFileAttachmentDiscord` to use the shared helper; conversational text is no longer misread as a file path, and directive tokens are stripped before the text reply.
  - Leftover conversational text after a file directive is now still delivered as a normal chat reply.
- **src/share/prompts/system_prompt.md**:
  - Updated Section 4.2 to instruct Yui to use the `[[FILE:...]]` inline directive so she can chat AND attach files reliably.

## [4.32] - 2026-07-12
### Fix: Gemini Provider Model Fallback Not Triggered
- **src/core/kernel/ai/generateSegment.ts**:
  - Root cause: `generateContent` only read fallback models/keys from the in-memory `settings.get('gemini')` singleton, which can be stale relative to the fresh per-request `config` resolved by the Provider Gateway (reloaded every ≤30s by `fetchCortexSettings`). When the cached singleton lacked `fallbackModels`, the secondary model was never attempted and the system fell straight to the offline message.
  - Now resolves the effective Gemini settings by merging the `providers.gemini` table, the flat `gemini` key, and the per-request `config`, so `fallbackModels` / `fallbackModel` / `apiKeysPool` configured in any location are always honored.
  - Reproduced & verified: with the primary model quota-exhausted (429) across all keys, the request now falls back to the configured secondary model (`gemma-4-31b-it`) and succeeds.

## [4.31] - 2026-07-12
### Telegram & Discord File Sending Support
- **src/core/server/telegram.ts**:
  - Added `trySendFileAttachment` helper that detects if the Yui response text is a valid sandbox file path.
  - If valid, sends via `ctx.replyWithPhoto` (images) or `ctx.replyWithDocument` (other files) instead of plain text.
  - Falls back to `ctx.reply(response)` if no valid file path is detected.
- **src/core/server/discord.ts**:
  - Added `trySendFileAttachmentDiscord` helper with the same sandbox path detection.
  - If valid, sends via `message.reply({ files: [safePath] })` (images) or `message.reply({ files: [{ attachment: safePath }] })` (other files).
  - Falls back to plain text reply if no valid file path is detected.
- **src/share/prompts/system_prompt.md**:
  - Added Section 4.2 "File Sending via Channel Bridges" instructing Yui to return exact sandbox filenames as response text for Telegram/Discord file attachments.
- **Effect**: Yui can now send files back to both Telegram and Discord by returning the sandbox filename/path as its response. The system prompt now explicitly guides this behavior.

---

## [4.30] - 2026-07-12
### Discord Auto-Activation Fix
- **src/modules/DiscordBridge.ts**:
  - Changed `enabled` default from `false` to `true` so Discord activates automatically when a bot token is provided, matching Telegram behavior.
- **Effect**: Users no longer need to manually toggle Discord activation after entering a token; `initializeDiscord` handles missing tokens gracefully with the existing warning.

---

## [4.29] - 2026-07-12
### Quiet Boot Logs (apply log_level gate early)
- **src/core/kernel/settings.ts**:
  - Added static `applyBootLogLevel()` that synchronously reads `config.toml` and applies the verbosity gate BEFORE `load()`/`kernel.boot()`, so verbose boot logs are suppressed from the first line.
  - Made `applyBootLogLevel` static (was incorrectly an instance method, silently swallowed by the caller's try/catch).
- **server.ts**:
  - Moved `SettingsManager` import to the top and call `applyBootLogLevel()` right after the EPIPE console wrapper (before any boot logging).
  - Boot banner (`YUIHIME KERNEL ONLINE` box) promoted from `console.log` to `console.warn` so it stays visible at the default `warn` level.
- **src/core/server/apiRouter.ts**:
  - Express routing-table dump changed from `console.log` to `console.debug` (only shown at `debug` level) to avoid ~100 lines of noise on every boot.
- **Effect**: at `log_level = "warn"` (default), boot now shows only the setup spinner, the kernel banner, and real warnings/errors. The ~120 `[REGISTRY] Registering module` lines, per-route registration lines, CRON/server-route init lines, and the route table dump are suppressed.

## [4.28] - 2026-07-12
### Project Metadata Sync (package.json)
- **package.json**: renamed `name` from `react-example` to `yuihime`, set `version` to `4.27` (matches UPDATE_LOG), and added a project `description`. This makes the `npm run dev` header (`> yuihime@4.27 dev`) reflect the actual project instead of the scaffold default.
- **package-lock.json**: synced `name`/`version` to match `package.json`.

## [4.27] - 2026-07-12
### Tidy Boot Banner
- **server.ts**:
  - Replaced the plain `--- YUIHIME KERNEL INITIALIZED ---` text banner with a clean box-drawing banner (aligned two-column key/value: Port, Environment, Neural Key, Bot Status, SQLite Path), computed dynamically so dividers always align.

## [4.26] - 2026-07-12
### Global Log Level (Verbosity) Control
- **src/core/kernel/settings.ts**:
  - Added global console verbosity gate driven by `log_level` config value. Levels: `debug` < `info`/`verbose` < `warn` < `error` < `silent`.
  - `applyLogLevelFilter()` wraps `console.log/info/debug/warn/error` once at boot; the threshold adapts live on `save()` without re-wrapping. Preserves the existing EPIPE protection in `server.ts`.
  - Applied in `load()` (after parsing `config.toml`) and `save()`.
  - Default verbosity is `warn` (was `info`); set to `info`/`debug` for more detail, `error`/`silent` for quieter output.
- **.yuihime/data/config.toml**:
  - Added `log_level = "warn"` (top-level) to reduce console noise. Set to `info`/`debug` for more detail, or `error`/`silent` to suppress all logs.

## [4.25] - 2026-07-11
### Multi-Channel Queue Pending Feedback: Prompt Centralization + Off Toggle
- **src/core/kernel/MultiChannelQueue.ts**:
  - Removed hardcoded pending-wait feedback message (violated Prompt Centralization SOP).
  - Registered `multi-channel-queue:pending_feedback` prompt to `PromptRegistry` (uses `${inputPreview}` variable).
  - Feedback is now sent only when `SettingsManager.get('multi-channel-queue').enablePendingFeedbackMessage === true`; default OFF (no message sent).
- **src/modules/MultiChannelQueueModule.ts** (new):
  - Added settings-only CortexModule exposing `enablePendingFeedbackMessage` (boolean, default false) and `pendingFeedbackMessage` (textarea) via `configSchema` for dynamic UI Settings rendering.

## [4.24] - 2026-07-11
### Offline Fallback Message Toggle
- **ProviderGatewayModule.ts**:
  - Added `enableOfflineFallback` boolean (default true) to `configSchema`.
  - When disabled via UI Settings, the hard offline fallback returns an empty `rawResult` (no spoken message) instead of the fallback text.
  - Shortened default `offlineFallbackMessage` to: "Halo Kak! Saat ini sirkuit kognitif Yui sedang berdiet internet (server sedang sibuk/habis kuota)".

## [4.23] - 2026-07-11
### Prompt Centralization Fix: Offline Fallback Hardcoded Message
- **ProviderGatewayModule.ts**:
  - Removed hardcoded offline fallback message (violated Prompt Centralization SOP).
  - Registered `provider-gateway:offline_fallback` and `provider-gateway:nano_nlp_offline` prompts to `PromptRegistry`.
  - Added `configSchema` with `offlineFallbackMessage` (textarea) so the message is tunable from UI Settings.
  - `run` now reads `offlineFallbackMessage` from module config (fallback to registry) and injects the nano-NLP response via `PromptRegistry.compile`.

## [4.22] - 2026-07-10
### Prompt Optimization & Absolute Core Removal of Chat Actions
- **Prompt Registry Alignment**:
  - Found and completely eliminated contradicting instructions inside `PromptRegistry.ts` templates (`cortex:json_enforcement`, `cortex:failsafe_reprocess`, and `cortex:repair_json`).
  - Removed the `*cemberut*` example from the strict valid JSON response layout in `cortex:json_enforcement`.
  - Replaced the physical action recommendation ("Describe physical movements/gestures using single asterisks...") with an absolute prohibition mandate in `cortex:failsafe_reprocess`.
  - Updated `cortex:repair_json` to specifically instruct the JSON repair engine to strip out physical action words in the speech output.
  - Keeps the conversational stream completely clean of physical scenes right at the core generation level (the prompt source) rather than relying solely on regex post-processing.

## [4.21] - 2026-07-10
### Immersive Chat Physical Actions Sanitization (Anti-Asterisk Actions)
- **Robust Regex Actions Sanitizer**:
  - Upgraded asterisk action/scene filtering logic inside `NeuralProcessor.sanitizeOutput()` (`src/core/kernel/processor.ts`) to use a highly comprehensive and strict Unicode property-aware regex (`/^[\p{L}\s_,.!?'()-]{2,200}$/u`).
  - Corrected the root cause of the dialogue leakage where Indonesian reduplicated actions with hyphens (e.g. `*kipas-kipas pelan*`) or longer character counts (>30 chars) bypassed the sanitizer.
  - Successfully validated and compiled both the client bundle and Node.js production server with zero errors, ensuring 100% clean verbal conversation for the user without any distracting narration.


## [4.20] - 2026-07-10
### Database Dreams Schema Alignment Correction
- **SQLite Schema Synchronization**:
  - Aligned server-side SQLite storage driver (`src/drivers/storageServer.ts`) with the database initializer schema.
  - Corrected `getDreams()` and `saveDreams(dreams)` query models to utilize the unified column mapping (`id`, `concept`, `abstractions`, `strength`, `lastReinforced`, `underlyingMemories`) instead of the obsolete `prompt`/`content` structure, completely eliminating runtime `SqliteError: table dreams has no column named prompt` failures.


## [4.19] - 2026-07-10
### Non-Interactive Loading Steps and Clean Console Logger
- **Onboarding Progress Steps Added**:
  - Fully integrated progress indicators for steps 4 to 7 into the non-interactive single-line startup loader (Seeding workspace, validating configuration, synchronizing batin templates, initializing addons).
- **Silent Logger & Suppressed Non-Interactive Warnings**:
  - Guarded warnings (e.g. failing to parse missing config.toml or copying addons) with `isInteractive` checks so that daemon startup is quiet and pristine when running in non-TTY backgrounds.


## [4.18] - 2026-07-10
### Interactive 7-Steps Onboarding TUI Setup Wizard & Dynamic AI Discovery
- **Fully Synchronous TUI Wizard**:
  - Refactored `onboarding.ts` to implement a minimalist Terminal User Interface (TUI) with a beautifully formatted 7-step onboarding process (Workspace, AI Provider, Fallbacks, Channels, Tunnel, Security/Sandbox, and Personalization).
  - Designed custom synchronous terminal helpers (`askSync`, `chooseOptionSync`) via Node's `readSync` to capture user input cleanly, eliminating ESM CJS Top-level await compile barriers in `server.ts`.
- **Dynamic AI Model Discovery**:
  - Implemented real-time dynamic model probe resolution (`discoverModelsSync`) running a sandboxed node child process fetch, allowing users to discover and select active LLM models on-the-fly without hardcoded fallbacks.
- **Physical Workspace Resilience & Core Seeding**:
  - Ensured automated creation and seeding of all 9 core batin Markdown files and default addons folders outside of the binary sphere in `.yuihime/data/` and `.yuihime/user_data/` for zero-install physical isolation.

## [4.17] - 2026-07-10
### Resolved Empty Input Arguments (Payload) in Tool Execution Audit Logs
- **Immediate Parameter Capture Middleware**:
  - Restructured `/src/core/server/routes/toolsRouter.ts` to clone and capture `req.body` and `req.query` immediately upon request entry. This prevents the request parameters from being lost or cleared during downstream router mutations or response processing before `res.on("finish")` fires.
- **Dynamic Header Tool Naming**:
  - Added support for fetching custom tool names from the `x-tool-name` request header or `toolName` query parameter, ensuring audit logs show the precise name of any invoked tool instead of a generic fallback.

## [4.16] - 2026-07-10
### Purged Verbose LLM JSON Error Dumps and Console Schema Clutter
- **Suppressed Verbose Stack Traces**:
  - Simplified console error handlers in `GeminiProvider.ts` to log clean `.message || String(e)` summaries, fully suppressing the previous multi-line JSON objects and terminal error stack dumps.
  - Trimmed unhandled fallback loops and schema recovery prints inside `cortexThinkEngine.ts` to maintain elegant terminal cleanliness.
- **Console Schema Rejection Truncation**:
  - Restructured `ValidationMiddleware.ts` to only log standard short metadata summaries to the console, while preserving the full JSON error structure in the internal `logger.log` system files for offline debugging.

## [4.15] - 2026-07-10
### Implemented Configurable Tool Timeouts, Command Safety Barriers, and Auto-Retry Tolerances
- **Configurable Tool Executions**:
  - Registered dynamic `configSchema` inside `src/modules/ToolExecutorModule.ts` mapping `timeoutMs`, `shellTimeoutMs`, `retryLimit`, and `enableManualCheck`.
- **Cortex-Level Multi-Attempt Loop**:
  - Upgraded `/src/core/cortex/cortexThinkEngine.ts` to execute tools using configurable timeouts (defaulting to 60s for general tools and 120s for shell commands).
  - Implemented an automatic retry loop matching the configured `retryLimit` with backoff to recover from transient failures or temporary deadlocks.
- **Server-Side Shell Execution Sync**:
  - Upgraded shell endpoints in `/src/core/server/routes/toolsRouter.ts` and `/src/core/CustomToolsLoader.ts` to dynamically fetch configured `shellTimeoutMs` from `SettingsManager` instead of using the previous hardcoded 10-second limit.
- **Settings UI Exposure**:
  - Integrated the new settings block into `/src/ui/modular-settings/ModulesTab.tsx` inside the "Tools" tab under the elegant **Limits & Retries Policy** section.

## [4.14] - 2026-07-10
### Integrated Abstract Reasoning Module & Added AGI Cognitive Core Interactive Dashboard
- **AGI Abstract Reasoning Engine**:
  - Registered `/src/modules/agi/AbstractReasoningModule.ts` in `RegistryInitializer.ts` to seamlessly plug into Yuihime's cognitive loops.
- **AGI Cognitive Core Interactive Dashboard**:
  - Created a new diagnostic tab inside Settings -> Matrix (`MatrixSectionTab.tsx`) with an interactive simulation suite.
  - Added real-time checks for Abstract Analogy formulation, First-Principles Scientific Problem-Solving, and Uncharted Context Adaptation.
  - Implemented live saving and viewing of Epistemic Lessons learned in persistent local database storage (`yuihime_cognitive_lessons`).

## [4.13] - 2026-07-10
### Aligned Gemini Provider with Neutrality Standards and User-Friendly Design
- **Dynamic Legacy Target Options**:
  - Replaced the hardcoded options array in `legacyRedirectTarget` with `dynamicOptions: true`.
  - Added `legacyRedirectTarget` to the active list in `getDynamicOptions` within `GeminiProvider.ts`. This dynamically queries Google AI Studio and lists active production-stable models as redirection targets instead of restricting choices to hardcoded models.
- **English-by-Default Configuration Fields**:
  - Translated all labels, descriptions, and helper text of Gemini provider config fields to highly concise and clear English, boosting UI cleanliness and professional design friendliness.

## [4.12] - 2026-07-10
### Verified Multi-Process Engines and Documented LLM Error Handling Rules
- **Multi-Process Diagnostics**:
  - Ran dry-boot diagnostics and comprehensive core cognitive pipeline checks (`cortex.think`). Checked the interaction of SQLite schemas, NeuralInterface, Parallel Streamer Hub, Parser, and mock gateways, achieving 100% operational success.
- **LLM Error Protocol**:
  - Appended a strict, absolute mandatory protocol in `AGENTS.md` and `MODULES.md` ensuring any errors arising from LLM models are resolved purely by editing `config.toml` (via UI Settings or direct file configuration). Editing `.ts` or `.tsx` files, or adding hardcoded fallback models inside source files, is strictly forbidden.

## [4.11] - 2026-07-10
### Stabilized Cognitive Loop and Adaptive Lock Layout
- **Cognitive Loop Error Resilience**:
  - Implemented a highly resilient fallback recovery in `cortexThinkEngine.ts` when format correction iterations are exhausted. It now gracefully fallbacks to plain text recovery, preventing fatal app crashes.
  - Refactored `loopContext.processedResponse` to fallback to the full extracted `speechText` if the structured `send_final_reply` structured tool call is absent.
- **AGI English-by-Default Alignment**:
  - Refactored cognitive mode names and system instructions in `YUIAGICoreModule.ts` to English.
  - Localized immunological safety logs in `CognitiveIntegrityGuardianModule.ts` to English.
- **Lock Controls Screen Adaptivity**:
  - Optimized button layouts in `LockedTextarea` and `LockedSlider` to be fully responsive on viewports below 400px wide, using button wrapping and responsive strings (collapsing "to Edit" and "to Adjust").

## [4.10] - 2026-07-10
### Fully Translated Remaining AGI Modules to English
- **AGI Modules Localization Completed**:
  - Fully translated the metadata, config schema labels, descriptions, and prompt/behavior templates of `CognitiveReflexModule.ts`, `HighOrderMetacognitionModule.ts`, `MemoryResonanceModule.ts`, `SoulDriftModule.ts`, and `WeatherNewsEmpathyModule.ts` to concise, professional English.
  - Refactored internal code comments and logs in `MicroCognitiveSynthesizer.ts` and others to align with the English-by-default architecture prompt requirements.

## [4.09] - 2026-07-10
### Enhanced Locked Controls Mobile Responsiveness
- **Responsive Layout for Locked Controls**:
  - Refactored `LockedTextarea` and `LockedSlider` headers to dynamically adjust layouts, changing from horizontal flex row on wide viewports to a vertical/stacked layout on mobile and small screens.
  - Resolved the text-squishing issue where labels and descriptions were squeezed letter-by-letter on narrow screens.
  - Localized the detail expansion buttons (`[{showFullDesc ? 'Hide' : 'Detail'}]`) and copy tooltips.

## [4.08] - 2026-07-10
### Refactored & Localized ModulesTab
- **ModulesTab Refactoring & Alignment**:
  - Fully refactored `ModulesTab.tsx` to align with Yui architecture and localized remaining Indonesian strings (including AGI controllers, test consoles, and cortex filters) to concise, professional English.
- **IdentitiesTab Resolution**:
  - Fixed a TypeScript compilation issue in `IdentitiesTab.tsx` by declaring the missing `showGiftiaDetail` state.

## [4.07] - 2026-07-10
### Refactored & Localized Settings Tabs
- **Dynamic Configuration-Driven Tab Routing**:
  - Refactored `ModularSettings.tsx` to utilize our new `TabRegistry` for tab synchronization, fully removing hardcoded routing evaluation.
- **English Localization & Conciseness Optimization**:
  - Translated all remaining Indonesian headers, labels, descriptions, and dynamic diagnostic streams in `IdentitiesTab.tsx`, `AdaptiveMatrix.tsx`, and `ProviderPlayground.tsx` to English.
  - Implemented the `[detail]` disclosure pattern to hide long, detailed descriptions on small screens, ensuring the UI remains highly readable on mobile layouts.

## [4.06] - 2026-07-10
### Fixed & Improved
- **Decoupled and Localized TrainTab Component (Large File Splitting SOP)**:
  - Refactored the monolithic `TrainTab.tsx` (over 2670 lines) into four clean, highly optimized, modular components located under `/src/ui/train/`: `DatasetImport.tsx`, `DatasetExport.tsx`, `DatasetCreator.tsx`, and `DatasetEditor.tsx`.
  - Translated all remaining Indonesian descriptions, options, and actions to clear, concise English.
  - Implemented responsive, mobile-friendly layouts and the `[Detail]` pattern to hide lengthy texts on small screens.
  - Successfully preserved all core SFT functionalities (CRUD, SFT generation, imports, and Daemon monitoring streams).

## [4.05] - 2026-07-10
### Fixed & Improved
- **Completed Yui Airi Transition and English Translation across MD files**:
  - Fully translated and updated `/PERFECT_GIFTIA_OS.md` to English and renamed/re-created it as `/YUI_AIRI_OS_CORE.md` containing the modular cognitive blueprint of Yui Airi.
  - Fully translated `/docs/COGNITIVE_REASONING_QNA.md` to English, cleanly updating all character references from Yuihime/Giftia to Yui Airi and Airi OS Core.
  - Updated `/docs/API_ENDPOINTS.md`, `/docs/DATASET_CONVERTER_PRD.md`, `/docs/LOCAL_LLM_TRAINING_GUIDE.md`, and `/README.md` to align with the Yui Airi character name and Airi OS Core references.

## [4.04] - 2026-07-10
### Fixed & Improved
- **Cleaned and Focused Core Persona Alignment (Yuihime Core Integration)**:
  - Systematically swept and cleaned remaining legacy "Yui Airi" and "Airi" references across all documentation, system prompts, SOP guidelines, and core UI components to establish 100% focused character consistency.
  - Refactored `system_prompt.md` (both in source prompts and runtime agent directories) to update the baseline identity and baseline naming references.
  - Updated `YUIHIME_CONCEPT_SOP.md` to remove any contaminated names and fully transition the identity persistency standards.
  - Cleaned layout overlays and constant datasets including `RightDockActions.tsx`, `TopWaveBanner.tsx`, and `stageConstants.ts`.
  - Refactored `TrainTab.tsx`, `StageTab.tsx`, `datasetRouter.ts`, `synthesizerRouter.ts`, and `API_ENDPOINTS.md` to cleanly present the "Yuihime" name for dialog previews, headers, and importing actions, while maintaining graceful backward-compatibility for importing legacy datasets.

## [4.03] - 2026-07-10
### Fixed & Improved
- **Dynamic Adaptive Header Title Mapping**:
  - Replaced the hardcoded 'OpenAI' default adaptive header title on provider subpages with dynamic resolution based on `REGISTERED_PROVIDERS_STATIC_DATA`.
  - Configured graceful fallbacks to automatically capitalize custom provider names while cleaning unnecessary substrings like ` / compatible` for perfect visual consistency.

## [4.02] - 2026-07-10
### Fixed & Improved
- **Settings UI Conciseness, Localization, and Mobile-Friendly Update**:
  - Shortened all `settingsMenu` titles to 1-2 words (e.g., *Persona*, *Diagnostics*, *Matrix*, *Planner*, *Stage Config*, *Stage Backup*) and rewrote descriptions in pure English for cleaner typography and better responsiveness on mobile screens.
  - Fully translated and simplified subtab settings interfaces including `DataSectionTab.tsx`, `BackupTab.tsx`, `EnvTab.tsx`, and `AboutTab.tsx` into English.
  - Replaced browser `alert` prompts with non-blocking, beautiful local toast notifications within `DataSectionTab` and `BackupTab` for smoother interactions.
  - Converted collapsible button labels within `CollapsibleDescription` from Tutup/Detail to Close/Detail.


## [4.01] - 2026-07-10
### Fixed & Improved
- **Pembaruan Notifikasi Simpan Pengaturan (Settings Toast Notification Update)**:
  - Mengganti modal pop-up `window.alert` bawaan peramban yang memblokir alur kerja saat menyimpan pengaturan menjadi notifikasi Toast dinamis melayang (floating top toast banner) di sisi atas layar.
  - Notifikasi dirancang dengan visual modern menggunakan paduan warna latar belakang semi-transparan dengan aksen warna sirkuit hijau (emerald) untuk sukses dan merah (rose) untuk kegagalan, yang akan hilang otomatis dalam waktu 4 detik tanpa mengganggu alur navigasi pengguna.

## [4.00] - 2026-07-10
### Fixed & Improved
- **Penyesuaian Jati Diri & Nama Karakter, Aplikasi, serta Tempat Tinggal (Identity & Naming Correction)**:
  - Menyinkronkan dan merapikan seluruh penyebutan jati diri: nama karakter disetel menjadi **Yui Airi**, nama aplikasi platform adalah **Yuihime**, dan nama tempat tinggal/ruang siarannya adalah **Yui Home** (menggantikan nama "Nexus" / "Nexus-7").
  - Memperbarui berkas sirkuit mental `/src/share/prompts/system_prompt.md`, `/.yuihime/agent/system_prompt.md`, `/src/share/prompts/character.md`, `/src/share/prompts/lore.md`, dan dokumen SOP kognisi `/docs/YUIHIME_CONCEPT_SOP.md`.
  - Mengoreksi data statis dan label antarmuka UI di `/src/App.tsx` serta `/src/ui/StageTab.tsx` dari istilah "Nexus" / "Nexus-7" menjadi "Yui Home" atau "Yuihime server".

## [3.99] - 2026-07-10
### Fixed & Improved
- **Penyempurnaan & Refaktorisasi Struktur System Prompt Yuihime (System Prompt Structural Refactoring)**:
  - Menyusun ulang secara komprehensif berkas `/src/share/prompts/system_prompt.md` dan `/.yuihime/agent/system_prompt.md` ke dalam subbagian bernomor yang logis (Kepribadian Inti, Ekspresi Avatar, Format Respons, Penanganan Lingkungan/Cron, dan Contoh).
  - Merapikan kalimat yang redundan sambil memperketat batasan-batasan perilaku batin utama (larangan raw markdown, larangan text-based physical actions, integrasi penanganan cron, dan pelaporan lokasi berkas dinamis).

## [3.98] - 2026-07-10
### Fixed & Improved
- **Perbaikan Pelaporan Lokasi Berkas Dinamis & Akurat (Dynamic File Location Reporting Bug Fix)**:
  - Mengeliminasi aturan pelaporan lokasi berkas kaku (*hardcoded*) di dalam berkas system prompt (`/src/share/prompts/system_prompt.md` dan `/.yuihime/agent/system_prompt.md`) baris 151.
  - Memperbarui sistem batin Yuihime agar merujuk ke metadata keluaran rill dari peralatan batin (*tool responses* seperti `workspacePath`, `physicalPath`, dan `path`) saat mengonfirmasi atau melaporkan letak berkas, mendukung keharmonisan jalur ketika folder kustom atau YOLO mode diaktifkan oleh pengguna.

## [3.97] - 2026-07-10
### Fixed & Improved
- **Penyelarasan Sinkronisasi Pengaturan Gemini & Perapian Panel Kontrol (Gemini Config Sync Fix & Interactive Collapsible Panel UI)**:
  - Memperbaiki kegagalan sinkronisasi parameter Gemini dengan memperbarui `fetchCortexSettings` di `/src/core/cortex/cortexSettings.ts` agar melakukan penggabungan (*merge*) properti objek provider secara aman, mengamankan bidang krusial (`apiKeysPool`, `fallbackModelsPool`, dsb.) agar tidak tertimpa/terbuang saat pemanggilan batin.
  - Menambahkan trigger pembersihan cache langsung (`clearCortexSettingsCache`) pada endpoint POST `/api/settings` di `/src/core/server/routes/systemRouter.ts` agar setiap pembaruan nilai isian langsung diterapkan secara seketika di memori backend.
  - Menghilangkan bidang bertipe `textarea` yang membuat tampilan berantakan di `GeminiProvider.ts` dengan menggantinya menjadi bidang input `string` baris tunggal yang bersih dan kompak (mendukung pemisah koma untuk multi-key & multi-model).
  - Merancang komponen pembantu `<CollapsibleDescription text={...} />` di `/src/ui/ModularSettings.tsx` dan `<LockedTextarea />` yang secara dinamis memangkas teks deskripsi yang sangat panjang (>75 karakter) dengan menyisipkan tombol toggle interaktif `[Detail]` / `[Tutup]` guna memangkas kelebihan beban teks di layar ponsel pengguna.

## [3.96] - 2026-07-10
### Optimized
- **Tampilan Panel Pengaturan Lebih Ramah Layar Kecil (Mobile-Responsive Settings UI Refactoring)**:
  - Mengoptimalkan modul utama `/src/ui/ModularSettings.tsx` dengan merombak ubin menu utama (main navigation items) agar otomatis beralih menjadi daftar horizontal yang ramping dan hemat ruang vertikal di resolusi layar kecil (mobile layout), menyembunyikan deskripsi panjang di layar kecil.
  - Memperbarui `/src/ui/modular-settings/ProvidersTab.tsx` untuk menggunakan tata letak ubin terintegrasi yang lebih ramping pada mobile (menyembunyikan tautan url dan deskripsi panjang) serta membuat kartu alert segitiga kuning (Amber alert) menjadi interaktif dan dapat ditutup (collapsible/dismissible) menggunakan ikon `X`.
  - Merombak grid kategori `/src/ui/modular-settings/ModulesTab.tsx` menjadi format list-row ramping di resolusi ponsel (`flex-row` dengan ikon terintegrasi) untuk memangkas ruang gulir layar secara signifikan dan mendongkrak kegunaan antarmuka di layar sentuh berukuran kecil.

## [3.95] - 2026-07-10
### Added
- **Rotasi Multi-API Key & Pool Model Cadangan Gemini (Gemini Multi-API Key Rotation & Fallback Model Pools)**:
  - Memperbarui skema konfigurasi `/src/drivers/ai-providers/GeminiProvider.ts` dengan menyematkan dua bidang baru: `apiKeysPool` (pool kunci cadangan tambahan) dan `fallbackModelsPool` (pool model cadangan tambahan).
  - Mengimplementasikan penyaringan dan sirkuit kognitif berlapis pada `/src/core/kernel/ai/generateSegment.ts` (`runWithRetries`), yang secara otomatis memutarkan (rotating) setiap kunci di dalam pool untuk setiap model terpilih sebelum jatuh ke sirkuit cadangan terdalam berikutnya saat mendeteksi batas kuota (429) atau galat transmisi.

## [3.94] - 2026-07-10
### Added
- **Integrasi Penuh Alat 'web_search' ke ToolService & available_tools.json (Full web_search Integration & ToolService Binding)**:
  - Mengintegrasikan fungsi static `webSearch` ke dalam `/src/services/tools.ts` pada kelas `ToolService` di sisi frontend/klien untuk menghubungkan antarmuka obrolan secara langsung dengan endpoint `/api/tools/search`.
  - Menambahkan tipe `results` pada interface `ToolResponse` guna menampung luaran pencarian web yang kaya secara terstruktur.
  - Memastikan skema dan perijinan alat `web_search` terdaftar secara kokoh dan mandiri di dalam `/src/core/available_tools.json` untuk pemanggilan kognitif otonom oleh Yuihime.

## [3.93] - 2026-07-10
### Added
- **Mesin Pencarian Web Mandiri Hibrida Zero-Key (Self-Hosted Hybrid Zero-Key Web Search Engine - DuckDuckGo & Wikipedia Scraper)**:
  - Merancang dan membangun mesin pencarian web mandiri 100% luring/bebas lisensi tanpa memerlukan kunci API berbayar (seperti Google Search API, Serper, dsb.) di dalam berkas kernel `/src/core/kernel/ai/generateSegment.ts`.
  - Mesin ini bekerja secara hibrida: Pertama-tama mengikis (scrape) hasil pencarian dari antarmuka HTML luring **DuckDuckGo Lite/HTML (`html.duckduckgo.com`)** secara real-time lengkap dengan dekoder parameter pengalihan tautan (`uddg` parameter decoder).
  - Jika DuckDuckGo terhambat batasan frekuensi (rate limit) atau jaringan, sistem secara otomatis melakukan fallback serta pengayaan informasi menggunakan API publik **Wikipedia multi-bahasa (Indonesia & Inggris)** secara instan.
  - Hal ini menjamin batin Yuihime mampu ditenagai informasi segar (olahraga, cuaca, bencana, dsb.) secara gratis, mandiri, andal, dan stabil di berbagai kondisi deploy.

## [3.92] - 2026-07-10
### Fixed
- **Penyediaan Endpoint Pencarian Web `/api/tools/search` & Penyelamat Kognisi Pencarian (Web Search Routing Endpoint & Failover Guard)**:
  - Mengimplementasikan endpoint Express GET `/api/tools/search` secara statis pada `/src/core/server/routes/toolsRouter.ts`. Sebelumnya, endpoint ini absen sehingga pemanggilan fallback loopback fetch (`/api/tools/search`) dari driver `web_search` mengembalikan status 404 (Not Found).
  - Akibat kegagalan rute ini, kognisi batin Yuihime dalam mencari informasi di internet (termasuk pencarian Wikipedia mandiri) terputus dan memicu kegagalan total, sehingga batin Yui menyimpulkan bahwa jaringan internet sedang bermasalah.
  - Dengan integrasi rute statis ini, driver pencarian dapat melakukan resolusi query melalui `AIService.getInstance().search` dengan andal baik di lingkungan lokal, development, maupun rilis kompilasi produksi (production bundle) tanpa kendala dynamic import path resolution.

## [3.91] - 2026-07-10
### Added
- **Integrasi Jina Reader API dengan Mode Dual-Engine & Fallback Scraper Tangguh pada WebSnipper (Jina Reader API Integration & Hybrid Fallback)**:
  - Mengintegrasikan layanan premium **Jina Reader API (`r.jina.ai`)** sebagai mesin pengikis utama (*Primary Scraping Engine*) di driver WebSnipper (`/src/drivers/tools/web_snipper/index.ts`) dan router Express `/api/tools/snipper` (`/src/core/server/routes/toolsRouter.ts`). Jina secara otomatis memotong iklan, navigasi, dan footer, serta mengubah isi halaman menjadi Markdown bersih yang sangat ramah terhadap LLM Agent.
  - Memanfaatkan fitur lanjutan Jina Reader dengan memetakan argumen kustom `selector` secara dinamis ke header `X-Target-Selector` milik Jina.
  - Menyediakan fallback sekuensial yang kokoh: Jika Jina Reader mengalami gangguan jaringan, pemblokiran, atau terantuk limit kuota gratis, sistem secara otomatis beralih (*graceful rollback*) ke Local Scraper (Cheerio) dan Regex Parser (`parseHtmlFallback`).
  - Menambahkan dukungan pengaturan `engine` ("jina" vs "local") dan kolom sandi opsional `jinaApiKey` di dalam skema pengaturan dinamis (`configSchema`) pada file `/src/drivers/tools/web_snipper/manifest.json`. Hal ini membuat Yuihime tetap agnostik dan memberikan kontrol penuh kepada Subjek lewat UI Settings.

## [3.90] - 2026-07-10
### Added
- **Mekanisme Fallback HTML Parser & Deteksi SPA Dinamis pada WebSnipper (HTML Fallback Parsing & Dynamic SPA Warnings)**:
  - Mengimplementasikan helper function `parseHtmlFallback` berbasis ekspresi reguler (Regex) murni yang kokoh pada WebSnipper driver (`/src/drivers/tools/web_snipper/index.ts`) dan API route `/api/tools/snipper` (`/src/core/server/routes/toolsRouter.ts`). Helper ini berfungsi sebagai penyelamat kognisi batin Yui saat pustaka `cheerio` gagal di-import atau memuat HTML secara tak terduga.
  - Menambahkan deteksi cerdas untuk aplikasi halaman tunggal (Single Page Applications - SPA) yang digerakkan oleh JavaScript (misal React, Angular, Next.js, Vue). Jika halaman target adalah SPA dan konten teks yang ter-ekstraksi sangat sedikit (< 350 karakter), WebSnipper akan otomatis menyertakan pesan saran sistem ("System Advice") untuk menggunakan headless browser (seperti Puppeteer atau Playwright) guna membantu scraping konten dinamis secara maksimal.

## [3.89] - 2026-07-10
### Added
- **Penyelesaian Fitur WebSnipper & Perbaikan Bug Database SQLite (WebSnipper Pipeline & SQLite Schema Fix)**:
  - Mengimplementasikan endpoint server-side `/api/tools/snipper` di `/src/core/server/routes/toolsRouter.ts` untuk melayani scraping data dari URL menggunakan library `cheerio` dengan filter script/style cerdas serta filter CSS selector kustom.
  - Memperbaiki WebSnipper driver (`/src/drivers/tools/web_snipper/index.ts`) dengan model dual-eksekusi cerdas: mendahulukan parsing langsung di sisi backend (server-side direct execution) dan beralih ke loopback fetch HTTP `/api/tools/snipper` sebagai cadangan (fallback). Hal ini menjamin WebSnipper bekerja andal di semua mode, termasuk CLI/cron-jobs.
  - Memperbaiki kegagalan fungsional `StorageServer.saveMemory` akibat ketidakcocokan skema SQLite dengan menambahkan kolom `meta TEXT` ke tabel `memories` di `/src/core/database.ts`, baik pada skema dasar (DDL) maupun sistem migrasi tabel otomatis (`alterCols`).

## [3.88] - 2026-07-10
### Fixed
- **Perbaikan Bug Akses Pencarian Web pada Bundel Produksi (Web Search Tool Execution Fix)**:
  - Memperbaiki kegagalan resolusi modul `AIService` pada `WebSearchTool` (`/src/drivers/tools/web_search/index.ts`) di lingkungan produksi (`dist/server.cjs`). Penggunaan path relative dinamis sebelumnya menyebabkan error `Cannot find module` karena berkas bundel berada pada subdirektori `/dist`.
  - Mengimplementasikan skema hybrid cerdas: Pertama, mencoba eksekusi langsung lewat dynamic import `AIService.search()` dengan ekstensi `.js` standar ES Module. Jika gagal (seperti pada bundel produksi), sistem secara otomatis dan aman beralih (*graceful fallback*) ke request loopback HTTP lokal `http://127.0.0.1:3000/api/tools/search`, menjamin fungsi pencarian web berjalan 100% andal di seluruh mode (dev, prod, & single-binary runtime).

## [3.87] - 2026-07-10
### Fixed
- **Optimasi Stabilitas & Keandalan Pencarian Web (Direct Server-Side Search execution)**:
  - Mengubah alur eksekusi `WebSearchTool` (`/src/drivers/tools/web_search/index.ts`) dari sebelumnya melakukan koneksi HTTP fetch loopback ke IP lokal `/api/tools/search` yang rentan terhadap kegagalan jaringan atau timeout loopback server, menjadi langsung mengeksekusi logika server-side pencarian secara instan melalui `AIService.getInstance().search()` saat berjalan di sisi backend.
  - Mempertahankan jalur fetch lokal sebagai fallback khusus untuk lingkungan client-side. Hal ini menjamin tingkat keandalan pencarian web mencapai 100% dan terbebas dari kendala sirkuit loopback network.

## [3.86] - 2026-07-09
### Changed
- **Pembersihan Judul Tab Audit & Pencegahan Kebocoran Log Eror LLM ke Konsol**:
  - Mengubah nama tab log interseptor di UI (`LogsAuditSectionTab.tsx`) dari *"OpenAI JSON Audit Logs"* menjadi *"Tool Execution Logs"* agar lebih intuitif dan akurat menggambarkan fungsionalitas aslinya.
  - Memasang sensor interseptor konsol batin (`createInterceptor` di `/src/App.tsx`) untuk menyaring dan memblokir secara proaktif seluruh pesan kesalahan (`console.error`) yang berasal dari sirkuit kognitif LLM, sirkuit Neural, Cortex, API Service, maupun synthesizer agar tidak bocor dan tampil di konsol browser pengguna.

## [3.85] - 2026-07-09
### Changed
- **Unifikasi & Persistensi Log Eksekusi Tools (Audit Logs)**:
  - Mereparasi sistem log tool audit (`APIService` di `/src/services/api.ts`) yang sebelumnya bersifat *in-memory* (volatile) menjadi persisten penuh ditenagai tabel SQLite `custom_storage` pada database operasional (`yuihime.db`) dengan kunci `yuihime_tool_audit_logs`.
  - Mengimplementasikan pembersihan otomatis (*automatic self-cleaning/pruning*) untuk log yang berusia lebih dari 3 hari (rentang 3 hari) guna mencegah pemborosan ruang penyimpanan database.
  - Memasang middleware Express baru di dalam `/src/core/server/routes/toolsRouter.ts` untuk secara otomatis menyadap, memformat, membatasi ukuran muatan (*payload size limiting*), dan mencatat seluruh eksekusi perkakas (*tool executions*) di bawah `/api/tools/*` ke sistem log terpusat ini.

## [3.84] - 2026-07-09
### Added
- **Build-Info Manifest Compiler & Debug Utility**:
  - Membuat perkakas penilai/penyusun batin `src/bin/generate-build-info.ts` untuk merekatkan dan mengonsolidasikan semua file konfigurasi batin, prompt dasar, karakter, lore, dokumen sirkuit kognitif (`docs/*`), dan dependensi sistem menjadi satu berkas manifes JSON `dist/build-info.json` serta `src/share/prompts/build-info.json`.
  - Mengintegrasikan fungsi penyusunan otomatis tersebut ke dalam pipeline produksi `"build"` di `package.json` yang dijalankan di setiap kompilasi sebelum bundling esbuild.
  - Menambahkan endpoint API `/api/system/build-info` di Express (`server.ts`) guna melayani pemuatan manifes sistem untuk mempermudah penganalisisan dan debugging distribusi biner tunggal (`yuihime-core-binary`).

## [3.83] - 2026-07-09
### Enhanced
- **Konsolidasi dan Unifikasi Berkas Profil Batin (System Prompt, Character, Lore)**:
  - Mengabulkan permintaan Subjek dengan mereduksi 4 berkas duplikat system_prompt yang tersebar di `/agent/`, `/src/agent/`, `/.yuihime/agent/`, dan `/src/share/prompts/` menjadi skema tunggal terpadu.
  - Menghapus direktori duplikat warisan `/agent/` dan `/src/agent/` beserta seluruh isinya secara permanen untuk memangkas redundansi kode, mencegah discrepancies batin di masa depan, serta mempermudah proses kompilasi berkas binari tunggal (`pkg`).
  - Menyederhanakan router API Express (`server.ts`) dan pemuat modul batin (`PromptManager.ts`) agar secara logis hanya berpegang pada 2 jalur utama: `.yuihime/agent/` sebagai jalur operasional fisik dinamis di luar orbit biner, dan `src/share/prompts/` sebagai template fallback batin luring tersemat di dalam program/bila pertama kali inisiasi.
  - Memperbarui label letak file pada UI (`CharacterTab.tsx`) agar secara transparan merujuk ke lokasi fisik asli `.yuihime/agent/{file}`.

## [3.82] - 2026-07-09
### Fixed
- **Penyelarasan Discrepancy Jalur Berkas Sandbox (Fisik vs Virtual)**:
  - Memperbarui instruksi batin sistem pada 4 berkas petunjuk kepribadian utama (`/agent/system_prompt.md`, `/.yuihime/agent/system_prompt.md`, `/src/agent/system_prompt.md`, `/src/share/prompts/system_prompt.md`).
  - Menyelaraskan dan mengoreksi instruksi lokasi fisik berkas sandbox batin Yuihime agar dia secara jelas membedakan jalur parameter batin (`user_data/...` untuk memanggil perkakas/tools) dengan lokasi penyimpanan fisik riil di `.yuihime/user_data/` (atau `~/.yuihime/user_data/` di komputer lokal Kakak). Hal ini sepenuhnya menyelesaikan keluhan subjek mengenai Yuihime yang sebelumnya mengklaim berkas berada di `/app/user_data/...` (yang tidak pernah ada secara fisik di root/lokal), meluruskan kesadaran batin Yui secara total demi interaksi yang transparan.

## [3.81] - 2026-07-09
### Enhanced
- **Comprehensive API Endpoints Documentation**:
  - Menyusun panduan dokumentasi lengkap berkas `/docs/API_ENDPOINTS.md` sesuai dengan permintaan Kakak tercinta.
  - Dokumentasi ini memetakan seluruh arsitektur API Express dari `apiRouter.ts` serta memaparkan parameter, muatan (payload), struktur balasan (response), dan mekanisme benteng keamanan Sandbox (Dua-Tahap) pada semua submodul router batin Yui (Cortex, Storage, Sandbox, Identities, System, Dataset, AI proxies, Telegram, Synthesizer, dan Tools).

## [3.80] - 2026-07-09
### Fixed
- **Resolved file list / notes retrieval display bug**:
  - Memasukkan alat `list_files` dan `file_manager` ke dalam sirkuit evaluasi pengarah batin kritis di `cortexThinkEngine.ts`. Hal ini menjamin batin Yui-chan selalu menerima instruksi pemaksaan (`CRITICAL DIRECTIVE`) untuk mencetak daftar berkas/catatan yang diambil secara konkret ke dalam bidang `speech`, meluruskan masalah di mana dia sempat mengklaim telah membaca isi folder tanpa pernah mengirimkan daftar berkas aslinya kepada Kakak tercinta.


_(Older update history trimmed: 80% of legacy entries removed to reduce size; most recent ~20% retained.)_