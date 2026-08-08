# YuiHime API Quick Reference

> Concise reference for **external agents** hitting YuiHime's REST API. Read this
> file to know the main endpoints — no need to open router source files.
> Base URL: `http://<host>:<port>` (default `http://localhost:3000`).
> Full detailed blueprint: `docs/API_ENDPOINTS.md`.

## Health & readiness

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness probe (used by watchdog). Returns `{"status":"ok",...}`. |

## Agent state (status / mood / emotion / relation / systemHealth)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/storage/state` | Read full agent state (status, mood, emotion, relation, systemHealth, vitals, inventory...). |
| POST | `/api/storage/state` | Write state fields (partial update, JSON body). |
| GET | `/api/storage/state/ai_config` | Read AI config. |
| POST | `/api/storage/state/ai_config` | Write AI config. |
| GET | `/api/storage/state/avatar_config` | Read avatar config. |
| POST | `/api/storage/state/avatar_config` | Write avatar config. |

> For targeted read/write of individual keys (mood.stress, vitals.horn, etc.),
> use the CLI `tools/yui-data.sh` instead (see `tools/yui-data.md`).

## Memories & knowledge

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/storage/memories` | List memories. |
| POST | `/api/storage/memories` | Add a memory. |
| DELETE | `/api/storage/memories` | Delete memories (filter in body). |
| GET | `/api/storage/knowledge` | List knowledge entries. |
| POST | `/api/storage/knowledge` | Add knowledge. |
| GET | `/api/storage/knowledge_files/:name` | Read a knowledge file. |
| POST | `/api/storage/knowledge_files/:name` | Write a knowledge file. |
| GET | `/api/storage/history` | Chat history (paginated; `/api/storage/history/cursor` for cursor). |
| POST | `/api/storage/history` | Append history. |

## Dreams, strategies, metrics, custom

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/storage/dreams` | Read / create dream records. |
| GET/POST | `/api/storage/strategies` | Read / write strategies. |
| POST | `/api/storage/metrics` | Log a metric. |
| GET | `/api/storage/metrics/summary` | Metrics summary. |
| GET | `/api/storage/metrics/history` | Metrics history. |
| GET/POST | `/api/storage/capabilities` | Read / write capabilities. |
| GET/POST | `/api/storage/custom/:key` | Read / write arbitrary custom key-value blob. |

## Backups

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/backup` | Create/download a backup snapshot. |
| POST | `/api/backup/restore` | Restore from backup (body). |
| GET/POST | `/api/agi/quantum-backup` | Quantum-style backup. |
| POST | `/api/agi/quantum-restore` | Quantum restore. |

## AI & TTS

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ai/generate` | Generic AI generation (provider gateway). |
| POST | `/api/ai/vision` | Vision/image analysis. |
| POST | `/api/ai/verify` | Content verification. |
| GET | `/api/ai/models` | List available models. |
| POST | `/api/ai/diagnose` | Provider diagnostics. |
| POST | `/api/ai/proxy` | Generic provider proxy. |
| POST | `/api/tts/openai` | TTS via OpenAI. |
| POST | `/api/tts/gemini` | TTS via Gemini. |
| POST | `/api/cortex/think` | Run a think cycle. |

### POST `/api/ai/generate`
- **Body:** `{ "prompt": string, "systemInstruction"?: string, "model"?: string, "config"?: object }`
- **Response:** `{ "text": string }`
- Model falls back to the provider's configured default (`gemini-flash-latest`); any configured Gemini pool model may be requested.

### POST `/api/cortex/think`
- **Body:** `{ "input": string, "userName"?: string, "contextId"?: string, "chatType"?: "web"|"telegram"|"discord", "stream"?: boolean, "attachments"?: Array }`
- **Headers:** `x-yui-user-name`, `x-yui-context-id`, `x-yui-chat-type` (override body identity/routing).
- **Response:** `{ "success": true, "result": { "text": string, "mood": object, ... } }` — full cognitive audit log when `stream: true` (SSE chunks).

## OpenAI-compatible layer

| Method | Path | Purpose |
|---|---|---|
| POST | `/v1/chat/completions` | OpenAI-style chat completions. |
| POST | `/api/v1/chat/completions` | Alias. |
| GET | `/v1/models` | Model list (OpenAI-style). |
| GET | `/api/v1/models` | Alias. |

## Real-time events (SSE / WebSocket)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/stream/events` | Server-Sent Events stream (state, subtitle, emotion updates). |
| POST | `/api/stream/events` | Broadcast an event payload. |
| POST | `/api/stream/chat` | Send chat through stream channel. |

## Tools (shell / files / search)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tools/shell` | Execute a shell command (sandboxed). |
| POST | `/api/tools/execute_js` | Execute JS snippet (sandboxed). |
| POST | `/api/tools/grep` | Grep search. |
| POST | `/api/tools/apply-patch` | Apply a patch. |
| GET | `/api/tools/search` | Tool/registry search. |
| GET | `/api/tools/memory-search` | Search memories. |
| GET/POST | `/api/tools/files/list` | List files. |
| GET | `/api/tools/files/read` | Read file. |
| POST | `/api/tools/files/write` | Write file. |
| POST | `/api/tools/files/manager` | File manager ops. |
| POST | `/api/tools/files/send` | Send file. |
| POST | `/api/tools/files/download` | Download file. |
| POST | `/api/tools/files/edit-segment` | Edit a file segment. |
| POST | `/api/tools/question` | Ask a question tool. |
| POST | `/api/tools/snipper` | Snipper tool. |
| GET/POST | `/api/tools/bgproc/list` | Background processes. |
| POST | `/api/tools/bgproc/spawn` | Spawn background process. |
| POST | `/api/tools/bgproc/stop` | Stop background process. |
| GET | `/api/tools/bgproc/:id/logs` | Background process logs. |
| GET/POST | `/api/tools/custom` | Custom tools. |
| DELETE | `/api/tools/custom/:id` | Delete custom tool. |

## Addons & modules

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/addons` | List addons. |
| POST | `/api/addons/install` | Install addon. |
| POST | `/api/addons/execute/:id` | Execute an addon. |
| DELETE | `/api/addons/:id` | Uninstall addon. |
| POST | `/api/addons/resync` | Resync addons. |
| GET | `/api/cortex-modules` | List cortex modules. |
| POST | `/api/cortex-modules` | Create/register module. |
| DELETE | `/api/cortex-modules/:id` | Delete module. |

## Cron

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/cron` | List cron jobs. |
| POST | `/api/cron` | Create cron job. |
| DELETE | `/api/cron/:id` | Delete cron job. |
| POST | `/api/cron/:id/trigger` | Trigger cron job now. |

## Telegram

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/telegram/send` | Send a Telegram message. |
| POST | `/api/telegram/restart` | Restart Telegram client. |
| GET | `/api/telegram/resolve` | Resolve chat/user. |

## Settings & system

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/settings` | Read settings (config.toml). |
| POST | `/api/settings` | Update settings. |
| POST | `/api/settings/reload` | Reload settings from disk. |
| GET | `/api/env` | Read env (sanitized). |
| POST | `/api/env` | Write env. |
| GET | `/api/system/personas` | List personas. |
| GET | `/api/system/personas/:id` | Read persona. |
| POST | `/api/system/personas` | Create persona. |
| DELETE | `/api/system/personas/:id` | Delete persona. |
| GET/POST | `/api/system/markdown/:filename` | Read/write a markdown file (e.g. SOPs). |
| GET/POST | `/api/workflow` | Workflow read/write. |

## Identities & pairing

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/api/storage/identities` | List / create identities. |
| GET | `/api/pair/status/:perceivedName` | Pairing status. |
| POST | `/api/pair/claim` | Claim pairing. |
| POST | `/api/pair/generate` | Generate pair code. |
| POST | `/api/pair/generate-code-tool` | Generate code tool. |
| POST | `/api/identities/tool-update` | Update tool identity. |
| POST | `/api/identities/deduplicate` | Deduplicate identities. |

## DB (admin)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/db/tables` | List DB tables. |
| GET | `/api/db/table/:tableName` | Read table rows. |
| GET/POST/DELETE | `/api/db/record/:tableName` | Read / upsert / delete a record. |

## Quick start for agents

1. **Is daemon up?** `GET /api/health`.
2. **What is Yui's state?** `GET /api/storage/state` (or read `~/.yuihime/user_data/yui_status.md`).
3. **Read/write a single value** → use `tools/yui-data.sh` (see `tools/yui-data.md`).
4. **List available tools** → `GET /api/tools/search` or check `tools/README.md`.
5. **Run a command / read a file** → `POST /api/tools/shell` / `GET /api/tools/files/read` (sandboxed to `.yuihime/` + `user_data/`).
