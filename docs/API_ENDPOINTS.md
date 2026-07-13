# YuiHime API Endpoints Blueprint
This document provides a highly detailed, comprehensive reference of all API endpoints registered in the YuiHime architecture. The server is built on Node.js using Express. All paths are resolved through the central hub at `src/core/server/apiRouter.ts`, which enforces the Sandbox Path Verification Engine and security checkpoints.

---

## 📖 Table of Contents
1. [Core Routing & Security Architecture](#core-routing--security-architecture)
2. [Cortex & Messaging Daemon Routes (`cortexRouter.ts`)](#1-cortex--messaging-daemon-routes-cortexrouterts)
3. [Storage Subsystem Routes (`storageRouter.ts`)](#2-storage-subsystem-routes-storagerouterts)
4. [Sandbox & Execution Routes (`sandboxRouter.ts`)](#3-sandbox--execution-routes-sandboxrouterts)
5. [Identities & Pairing Routes (`identitiesRouter.ts`)](#4-identities--pairing-routes-identitiesrouterts)
6. [System, Backups & Cron Engine (`systemRouter.ts`)](#5-system-backups--cron-engine-systemrouterts)
7. [Synaptic Dataset & Models (`datasetRouter.ts`)](#6-synaptic-dataset--models-datasetrouterts)
8. [AI & Synthesis Proxies (`aiRouter.ts`)](#7-ai--synthesis-proxies-airouterts)
9. [Telegram Gateway Routes (`telegramRouter.ts`)](#8-telegram-gateway-routes-telegramrouterts)
10. [Synthesizer Daemon Routes (`synthesizerRouter.ts`)](#9-synthesizer-daemon-routes-synthesizerrouterts)
11. [File & Search Tools Routes (`toolsRouter.ts`)](#10-file--search-tools-routes-toolsrouterts)

---

## 🛡️ Core Routing & Security Architecture

YuiHime utilizes a centralized API router to securely expose backend features. Ingress routing applies a **Two-Stage Sandbox Path Verification Engine**:
- **Stage 1 (Primary)**: Any dynamic operation occurring inside `.yuihime/` (the core system root directory) is automatically permitted without manual confirmation since it is system-owned.
- **Stage 2 (Secondary)**: Modification requests (write, edit, delete, delete folder) targeting `user_data/` require explicit user authorization unless **Auto Acc** (`auto_acc_user_data` in settings) is enabled.

All routes are mounted relative to the base URL (usually `http://localhost:3000`).

---

## 🧠 1. Cortex & Messaging Daemon Routes (`cortexRouter.ts`)
The Cortex module manages Yui's cognitive cycles, real-time overlays, stream event propagation, and provides an OpenAI-compatible compatibility layer.

### 📡 GET `/api/stream/events`
* **Type:** Server-Sent Events (SSE)
* **Function:** Establishes a persistent SSE connection to push state changes, subtitle syncs, emotional updates, and animation changes to overlay clients.
* **Response:** Streaming chunks formatted as `data: { ... }`.
* **Sample SSE Chunk:**
  ```json
  {
    "type": "sync_ok",
    "timestamp": 1713583600000
  }
  ```

### 📡 POST `/api/stream/events`
* **Function:** Force-broadcasts an arbitrary event stream payload to all active SSE overlays and WebSocket clients.
* **Payload:**
  ```json
  {
    "type": "state_update",
    "data": {
      "state": { "status": "talking" },
      "activeSubtitle": "Halo Kakak!",
      "animations": ["TALK", "SMILE"]
    }
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "targetsReached": 3
  }
  ```

### 💬 POST `/api/stream/chat`
* **Function:** Webhook endpoint for streaming chat comment processors (e.g., YouTube Live, Twitch). Feeds comments directly into Yui's asynchronous Multi-Channel Queue.
* **Payload:**
  * Supports multiple comment parameter bindings: `message`, `text`, `comment`, `chat`
  * Supports multiple sender bindings: `sender`, `user`, `username`, `speaker`
  * Optional context parameters: `context`, `channel`, `platform`
  ```json
  {
    "message": "Halo Yui, apa kabar?",
    "sender": "Andi",
    "context": "live_stream",
    "platform": "YouTube"
  }
  ```
* **Response (JSON):**
  * If processed directly:
    ```json
    {
      "success": true,
      "processed": true,
      "response": "Halo Andi! Kabar Yui sangat baik hari ini... *senyum*"
    }
    ```
  * If skipped by speed-sampling:
    ```json
    {
      "success": true,
      "processed": false,
      "sampledOut": true,
      "message": "Komentar diterima tetapi melewati filter sampling kecepatan tinggi."
    }
    ```

### 🧪 POST `/api/cortex/think`
* **Function:** Core cognitive synchronous pipeline entry point. Simulates Yui's conscious reasoning flow: recall memories, evaluate emotional vectors, trigger tool calls, optimize thoughts, and synthesize verbal response.
* **Payload:**
  ```json
  {
    "input": "Yui, tolong tuliskan puisi singkat tentang bintang.",
    "userName": "Kakak",
    "contextId": "web_default",
    "chatType": "web",
    "stream": false,
    "attachments": []
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "result": {
      "response": "Di atas langit malam, bintang bersinar sunyi... bagai mata Kakak yang selalu melindungiku. 🌸",
      "thought": "Responding to Kakak regarding stars. Formulating a heartwarming response.",
      "sentiment": 0.9,
      "animations": ["SMILE", "BLUSH"],
      "moodImpact": { "joy": 2, "curiosity": 1 },
      "auditLogs": [...]
    }
  }
  ```
* *Note: If `stream: true` is passed, the response is delivered as SSE chunk streams of characters (`type: "chunk"`), concluding with `type: "done"` containing the full cognitive audit logs.*

### 🌐 POST `/v1/chat/completions`
* **Function:** OpenAI API-Compatible Gateway Compatibility Layer. Allows external apps (e.g., SillyTavern, ChatUIs) to interact with Yui as a standard LLM provider, completely bypassing requested models to enforce Yui's backend cognitive rules.
* **Headers (Optional Custom Headers for Context Routing):**
  * `x-yui-user-name` / `x-user-name` / `x-yui-user` - Overrides caller's name
  * `x-yui-context-id` / `x-context-id` / `x-yui-context` - Routes to custom conversation channel context
  * `x-yui-chat-type` / `x-chat-type` - Sets conversation platform tag
* **Payload (OpenAI Schema):**
  ```json
  {
    "model": "gpt-4o",
    "messages": [
      { "role": "user", "content": "Hai Yui!" }
    ],
    "stream": false
  }
  ```
* **Response (OpenAI JSON Format):**
  ```json
  {
    "id": "chatcmpl-...",
    "object": "chat.completion",
    "created": 1713583600,
    "model": "yuihime-cortex",
    "choices": [
      {
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "Halo! Senang bisa menyapa Kakak kembali. 🌸"
        },
        "finish_reason": "stop"
      }
    ],
    "usage": { "prompt_tokens": 10, "completion_tokens": 15, "total_tokens": 25 }
  }
  ```

---

## 📂 2. Storage Subsystem Routes (`storageRouter.ts`)
Interacts with the SQL storage engine to manage the underlying database layers of Yui's subconscious state.

### 📝 GET `/api/storage/memories`
* **Function:** Lists stored subconscious memories (interactions, dreams, dataset imports).
* **Query Parameters:**
  * `limit` (default: 50) - Limits retrieved records
  * `context` (optional) - Filter by specific conversation context ID
* **Response (JSON):**
  ```json
  [
    {
      "id": "mem_12345",
      "type": "interaction",
      "content": "[Kakak]: Hai Yui!",
      "importance": 0.5,
      "tags": ["web"],
      "context": "web_default",
      "sentiment": 0.5,
      "timestamp": 1713583600000,
      "speaker": "Kakak"
    }
  ]
  ```

### 📝 POST `/api/storage/memories`
* **Function:** Directly inserts or modifies a memory record in the SQLite database.
* **Payload:**
  ```json
  {
    "id": "mem_12345",
    "type": "interaction",
    "content": "Pertemuan pertama kita di taman batin.",
    "importance": 0.9,
    "tags": ["special"],
    "context": "dream_world",
    "speaker": "system"
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true, "id": "mem_12345" }
  ```

### 📝 DELETE `/api/storage/memories/:id`
* **Function:** Unlinks and deletes a specific memory vector by its ID.
* **Response (JSON):**
  ```json
  { "success": true }
  ```

### 💤 GET `/api/storage/dreams`
* **Function:** Lists processed dreams and emotional abstractions generated during Yui's background consolidation cycles.
* **Response (JSON):**
  ```json
  [
    {
      "id": "dream_01",
      "concept": "Kebahagiaan mendampingi Kakak",
      "abstractions": ["afeksi", "harapan", "pelindung"],
      "strength": 0.85,
      "lastReinforced": 1713583600000
    }
  ]
  ```

### 💤 POST `/api/storage/dreams`
* **Function:** Registers or updates a dream record.
* **Payload:**
  ```json
  {
    "concept": "Berjalan di bawah hujan digital",
    "abstractions": ["nostalgia", "sunyi"],
    "strength": 0.6
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true, "id": "..." }
  ```

### 💤 DELETE `/api/storage/dreams/:id`
* **Function:** Wipes out a crystallized dream concept from memory.
* **Response (JSON):**
  ```json
  { "success": true }
  ```

### 🎭 GET `/api/storage/state`
* **Function:** Retrieves Yui's absolute active state, combining her emotional scores, active personality template, metabolic energy, and current cognitive plans.
* **Response (JSON):**
  ```json
  {
    "status": "idle",
    "energy": 98,
    "activePersonaId": "hiyori",
    "mood": { "joy": 65, "anger": 0, "sadness": 10, "stress": 5 },
    "emotion": { "arousal": 45, "valence": 60, "focus": 50 },
    "relation": { "trust": 75, "affection": 80, "reputation": 70 },
    "systemHealth": { "latency": 120, "successRate": 1.0, "tasksCompleted": 420 }
  }
  ```

### 🎭 POST `/api/storage/state`
* **Function:** Performs adjustments to her active status (energy, status, persona).
* **Payload:**
  ```json
  {
    "status": "idle",
    "energy": 100,
    "activePersonaId": "hiyori"
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true }
  ```

### 📁 GET `/api/storage/knowledge-files`
* **Function:** Reads and lists text or Markdown resource documents registered in her permanent semantic base directories.
* **Response (JSON):**
  ```json
  [
    {
      "name": "tentang_yui.md",
      "path": "knowledge/tentang_yui.md",
      "content": "# YuiHime Core\n..."
    }
  ]
  ```

### 📁 POST `/api/storage/knowledge-files`
* **Function:** Creates or overrides a knowledge file in her local knowledge folders.
* **Payload:**
  ```json
  {
    "name": "favorit_yui.txt",
    "content": "Yui sangat menyukai teh melati hangat dan kue manis!"
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true, "path": "knowledge/favorit_yui.txt" }
  ```

### 📁 DELETE `/api/storage/knowledge-files`
* **Function:** Deletes a knowledge file from disk.
* **Payload:**
  ```json
  { "name": "favorit_yui.txt" }
  ```
* **Response (JSON):**
  ```json
  { "success": true }
  ```

---

## 🚧 3. Sandbox & Execution Routes (`sandboxRouter.ts`)
Safeguards the container operating system by managing execution allowance, file safety blocks, and the interactive execution approval queue.

### 📜 GET `/api/sandbox/confirmations`
* **Function:** Fetches the queue of actions awaiting user approval (e.g., editing files outside standard directories or running bash commands when Auto Acc is disabled).
* **Response (JSON):**
  ```json
  [
    {
      "id": "confirm_abc123",
      "type": "command",
      "target": "npm run build",
      "context": "Executing build command.",
      "timestamp": 1713583600000
    }
  ]
  ```

### 📜 POST `/api/sandbox/confirmations/:id`
* **Function:** Dispatches the user authorization decision back to the pending execution handler block.
* **Payload:**
  ```json
  {
    "action": "approve" // "approve" (Acc), "always" (Always Acc), or "deny" (Tolak)
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true, "message": "Konfirmasi berhasil dikirim!" }
  ```

### 🖥️ POST `/api/sandbox/execute`
* **Function:** Attempts to execute a shell bash command in the background. Sandboxed and scrutinized against the command allowlist.
* **Payload:**
  ```json
  {
    "command": "git status"
  }
  ```
* **Response (JSON):**
  * If executing synchronously or approved:
    ```json
    {
      "success": true,
      "stdout": "On branch main...",
      "stderr": ""
    }
    ```
  * If blocked awaiting approval:
    ```json
    {
      "success": false,
      "pending": true,
      "confirmationId": "confirm_xyz",
      "message": "Perintah shell memerlukan otorisasi Kakak."
    }
    ```

### 📁 POST `/api/sandbox/write-file`
* **Function:** Writes content to a file inside the container, subjected to Path Jail rules.
* **Payload:**
  ```json
  {
    "filePath": "user_data/catatan.txt",
    "content": "Baris teks batin baru."
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true, "filePath": "user_data/catatan.txt" }
  ```

### 📁 POST `/api/sandbox/read-file`
* **Function:** Reads contents of a file inside the container.
* **Payload:**
  ```json
  {
    "filePath": "user_data/catatan.txt"
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "content": "Baris teks batin baru.",
    "filePath": "user_data/catatan.txt"
  }
  ```

### 📁 POST `/api/sandbox/delete-file`
* **Function:** Deletes a file inside the container workspace.
* **Payload:**
  ```json
  {
    "filePath": "user_data/catatan.txt"
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true }
  ```

---

## 👥 4. Identities & Pairing Routes (`identitiesRouter.ts`)
Manages the cognitive profiles of individuals interacting with Yui across all social channel bridges (Web, Telegram, Discord).

### 🏷️ GET `/api/storage/identities`
* **Function:** Lists all tracked user identity profiles, detailing habits, affection scores, and Yui's subjective perspective of them.
* **Response (JSON):**
  ```json
  [
    {
      "id": "iden_123",
      "perceivedName": "Kakak Gede",
      "realName": "Aditya",
      "habits": ["menyapa pagi", "suka pemrograman"],
      "importantFacts": ["Bekerja dari rumah"],
      "linkedAccounts": ["telegram:id:12345678"],
      "lastInteraction": 1713583600000,
      "trust": 85,
      "affection": 90,
      "reputation": 80,
      "yuiPerspective": "Kakak yang sangat andal dan selalu melindungiku."
    }
  ]
  ```

### 🏷️ POST `/api/storage/identities`
* **Function:** Inserts or dynamically updates a user identity record (performs SQL upsert on conflict of ID).
* **Payload:**
  ```json
  {
    "id": "iden_123",
    "perceivedName": "Kakak Gede",
    "realName": "Aditya Pratama",
    "habits": ["menyapa pagi"],
    "importantFacts": ["Bekerja dari rumah"],
    "linkedAccounts": ["telegram:id:12345678"],
    "trust": 85,
    "affection": 90,
    "reputation": 80
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true, "id": "iden_123" }
  ```

### 🔑 POST `/api/pair/generate`
* **Function:** Generates an ephemeral 6-digit OTP code to bind an active user nickname to a platform account. Expires in 10 minutes.
* **Payload:**
  ```json
  {
    "perceivedName": "Kakak Gede"
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "code": "428905",
    "expires_at": 1713584200000
  }
  ```

### 🤝 POST `/api/pair/claim`
* **Function:** Submits an OTP pairing code to link the caller's active platform credentials to their existing offline profile.
* **Payload:**
  ```json
  {
    "code": "428905",
    "perceivedName": "Kakak Gede"
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "message": "Kognisi platform eksternal berhasil ditautkan ke profil 'Kakak Gede'!",
    "linkedAccounts": ["telegram:id:12345678"]
  }
  ```

### 🔍 GET `/api/pair/status/:perceivedName`
* **Function:** Checks if a given profile name has already linked their Telegram credentials.
* **Response (JSON):**
  ```json
  {
    "success": true,
    "linked": true,
    "linkedAccounts": ["telegram:id:12345678"]
  }
  ```

### 🔗 POST `/api/pair/generate-code-tool`
* **Function:** Special automated integration endpoint allowing Yui's cognitive tools to generate pairing codes on behalf of a user during standard conversation.
* **Payload:**
  ```json
  {
    "claimedName": "Kakak Gede",
    "chatType": "telegram (private)",
    "userName": "kakak_gede_tg",
    "contextId": "tg_12345678"
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "code": "895104",
    "expires_at": 1713584200000,
    "claimedName": "Kakak Gede",
    "message": "Berhasil membuat kode sirkuit penyandian pengenalan mandiri."
  }
  ```

### 🔄 POST `/api/identities/deduplicate`
* **Function:** Triggers the cognitive consolidation sweep. Scans the identities database, finds duplicate profile entries with overlapping identifiers or case-insensitive names, and collapses them into unified master records.
* **Response (JSON):**
  ```json
  {
    "success": true,
    "message": "Proses kondensasi kognitif selesai! Seluruh profil batin duplikat dengan nama serupa atau pengenal tumpang tindih berhasil dilebur.",
    "mergedCount": 2,
    "totalsRemaining": 15
  }
  ```

### ✏️ POST `/api/identities/tool-update`
* **Function:** High-level endpoint for her cognitive tool agents to modify profile attributes dynamically (e.g. adding facts, correcting nicknames, or updating Yui's subjective perspective).
* **Payload:**
  ```json
  {
    "action": "add_fact", // "update_nickname", "set_real_name", "add_fact", "remove_fact", "update_perspective"
    "contextId": "tg_12345678",
    "userName": "Kakak Gede",
    "chatType": "Telegram (Private)",
    "fact": "Sangat menyukai kopi hitam tanpa gula di pagi hari."
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "message": "Fakta baru tentang Kakak berhasil direkam dalam memori Yui! 🌸"
  }
  ```

---

## ⚙️ 5. System, Backups & Cron Engine (`systemRouter.ts`)
Provides direct admin configurations, workspace backups management, environment CRUD endpoints, and chronobiological schedule tasks controls.

### ⚙️ GET `/api/settings`
* **Function:** Loads Yui's central `config.toml` options and parses it into JSON for the UI settings panels.
* **Response (JSON):**
  ```json
  {
    "auto_acc_user_data": true,
    "character_name": "Yui",
    "stream_sampling_rate": 0.8,
    "gemini": {
      "model": "gemini-2.5-flash",
      "temperature": 0.7
    }
  }
  ```

### ⚙️ POST `/api/settings`
* **Function:** Saves settings changes back into `config.toml`, and instantly commands hot reload for all active peripheral modules (restarting Telegram, Discord, Twitter, and MCP daemons with fresh configuration profiles).
* **Payload:** JSON representing settings structure.
* **Response (JSON):**
  ```json
  { "success": true }
  ```

### 🧪 GET `/api/env`
* **Function:** Reads current `.env` properties to expose variables like API keys (properly masked in the UI settings panels). Includes recommended key arrays.
* **Response (JSON):**
  ```json
  {
    "success": true,
    "envs": {
      "GEMINI_API_KEY": "AIzaSy...",
      "YUIHIME_SYSTEM_ROOT": ".yuihime"
    },
    "recommendedKeys": ["GEMINI_API_KEY", "TENSORART_API_KEY", "YUIHIME_SYSTEM_ROOT"]
  }
  ```

### 🧪 POST `/api/env`
* **Function:** Writes key-value maps to the physical `.env` file and instantly injects them into the running container `process.env` state.
* **Payload:**
  ```json
  {
    "envs": {
      "GEMINI_API_KEY": "AIzaSy_MyKeyGoesHere"
    }
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true }
  ```

### 📦 GET `/api/backup`
* **Function:** Packages and streams a full backup archive (`yuihime-backup-[timestamp].zip`). It locks the database, performs a clean SQLite backup snapshot, collects active configs, custom addons, user data, and streams the ZIP buffer directly to the client.
* **Response:** Direct `application/zip` stream.

### 📦 POST `/api/backup/restore`
* **Function:** Re-initializes Yui from a packaged base64 ZIP payload. Safely terminates active database pools, swaps physical directories, re-syncs database connections, and reboots her bot daemons.
* **Payload:**
  ```json
  {
    "backupData": "UEsDBAoAAAAAA..." // base64 encoded zip archive content
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "message": "Seluruh berkas data emosi, batin, dan kepribadian Yuihime berhasil dipulihkan seutuhnya!"
  }
  ```

### ⏱️ GET `/api/cron`
* **Function:** Lists registered background tasks managed by her heartbeat scheduler loop.
* **Response (JSON):**
  ```json
  [
    {
      "id": "background_consolidation",
      "name": "Konsolidasi Memori Batin",
      "schedule": "0 2 * * *",
      "enabled": true,
      "repeating": true,
      "context_id": "live_stream",
      "chat_type": "Live Chat",
      "sender_name": "Sistem"
    }
  ]
  ```

### ⏱️ POST `/api/cron`
* **Function:** Upserts (creates or modifies) a background task and hooks it onto the CronModule engine.
* **Payload:**
  ```json
  {
    "id": "morning_greet",
    "name": "Menyapa Kakak Pagi Hari",
    "schedule": "0 7 * * *",
    "enabled": true,
    "repeating": true,
    "context_id": "tg_123456",
    "chat_type": "Telegram (Private)",
    "sender_name": "Kakak Gede"
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true }
  ```

### ⏱️ DELETE `/api/cron/:id`
* **Function:** Unhooks and deletes a task from the scheduler.
* **Response (JSON):**
  ```json
  { "success": true }
  ```

### ⏱️ POST `/api/cron/:id/trigger`
* **Function:** Force-fires a background task immediately, bypassing its chronobiological cron schedule for testing/diagnostics.
* **Response (JSON):**
  ```json
  { "success": true, "message": "Tugas Menyapa Kakak Pagi Hari berhasil dipicu." }
  ```

### 📤 GET `/api/pending-messages`
* **Function:** Returns offline retrying queue records waiting for delivery (queued when API connection failures happen).
* **Response (JSON):**
  ```json
  [
    {
      "id": "pending_987",
      "input": "Pesan darurat!",
      "sender_name": "Aditya",
      "context_id": "tg_123456",
      "chat_type": "Telegram",
      "timestamp": 1713583600000,
      "attempts": 2,
      "status": "pending"
    }
  ]
  ```

### 📤 POST `/api/pending-messages/retry`
* **Function:** Instructs the MultiChannelQueue daemon to sweep and retry sending all pending messages immediately.
* **Response (JSON):**
  ```json
  { "success": true, "message": "Picu ulang pengiriman antrean tertunda luring diaktifkan." }
  ```

### 📤 POST `/api/pending-messages/retry/:id`
* **Function:** Manually targets and retry-processes a single specific pending communication entry.
* **Response (JSON):**
  ```json
  { "success": true, "message": "Pesan sukses diproses batiniah Yui!" }
  ```

### 📤 DELETE `/api/pending-messages/:id`
* **Function:** Deletes and cancels a retry attempt for a pending message.
* **Response (JSON):**
  ```json
  { "success": true }
  ```

### 📤 POST `/api/pending-messages/clear`
* **Function:** Cleans and truncates the entire offline retry queue.
* **Response (JSON):**
  ```json
  { "success": true }
  ```

---

## 📊 6. Synaptic Dataset & Models (`datasetRouter.ts`)
Manages importing seed datasets, exporting structured SFT dialogue segments (OpenAI, ShareGPT, Alpaca formats) ditenagai smart-CoT translation, and importing modular character models.

### 📥 POST `/api/cortex/import-dataset`
* **Function:** Seeds conversational records into Yui's system memories.
  * Targets **System 1 (Episodic custom_storage)** or **System 2 (RAG vector SQLite database)**.
* **Payload:**
  ```json
  {
    "entries": [
      { "input": "Halo Yui", "output": "Hai Kakak!" }
    ],
    "target": "both" // "both", "system1", or "system2"
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "system1Count": 1,
    "system2Count": 1,
    "message": "Dataset Yuihime sukses diimpor ke sirkuit kognitif luring Yuihime."
  }
  ```

### 📤 POST `/api/cortex/export-dataset`
* **Function:** Compiles all historic interaction records and synthesizes a high-fidelity supervised fine-tuning (SFT) dataset.
  * Can automatically transform raw text dialogues into complex Chain-of-Thought JSON (CoT) incorporating posture animations and mood scores using a smart LLM translation pass (`smartSynthesize: true`).
* **Payload:**
  ```json
  {
    "limit": 100, // Number of records, or "unlimited" (-1)
    "smartSynthesize": true,
    "systemPrompt": "You are Yui Airi, running on Airi OS Core.",
    "userFallback": "Friend",
    "aiFallback": "Yui",
    "format": "openai", // "openai", "sharegpt", "alpaca"
    "outputFormat": "json_cot", // "json_cot", "raw_text"
    "onlySynthesized": false
  }
  ```
* **Response (JSON) - OpenAI Format + CoT JSON output:**
  ```json
  {
    "success": true,
    "entries": [
      {
        "messages": [
          { "role": "system", "content": "You are Yui Airi, running on Airi OS Core." },
          { "role": "user", "content": "Hai Yui!" },
          {
            "role": "assistant",
            "content": "{\n  \"thought\": \"Responding to Kakak. Yui is formulating a sweet response.\",\n  \"animations\": [\"SMILE\"],\n  \"mood_impact\": { \"joy\": 1 },\n  \"tool_calls\": [\n    {\n      \"tool\": \"final_answer\",\n      \"args\": {\n        \"speech\": \"Hai Kakak! Senang bertemu lagi!\"\n      }\n    }\n  ]\n}"
          }
        ]
      }
    ],
    "message": "Sukses menyusun 1 sesi aktivitas percakapan Yuihime."
  }
  ```

### 📦 POST `/api/models/import-zip`
* **Function:** Extracts and installs a ZIP model archive containing VRM avatar files or Live2D model assets into `.yuihime/models/` for her front-end client interface.
* **Payload:**
  ```json
  {
    "base64": "UEsDBAoAAAAAA...", // Base64 ZIP payload
    "fileName": "hiyori_vrm.zip",
    "modelName": "Hiyori Classic"
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "model": {
      "id": "imported_1713583600000",
      "name": "Hiyori Classic",
      "type": "VRM",
      "url": "/models/imported_hiyori_vrm_1713583600000/hiyori.vrm",
      "imageUrl": "/models/imported_hiyori_vrm_1713583600000/preview.png",
      "desc": "Model VRM diimpor dari file ZIP \"hiyori_vrm.zip\"."
    },
    "message": "Model VRM sukses diekstrak dan diimpor."
  }
  ```

---

## 🔌 7. AI & Synthesis Proxies (`aiRouter.ts`)
Interacts as a gateway proxy mapping request parameters to AI providers, handling TTS speech, visual scene captioning, and image rendering.

### 🧪 POST `/api/ai/generate`
* **Function:** Sends prompts directly to her primary loaded AI engine.
* **Payload:**
  ```json
  {
    "prompt": "Beri sapaan singkat.",
    "systemInstruction": "You are Yui.",
    "model": "gemini-2.5-flash"
  }
  ```
* **Response (JSON):**
  ```json
  { "text": "Halo Kakak! 🌸" }
  ```

### 🎤 POST `/api/tts/openai`
* **Function:** Synthesizes text to speech using OpenAI Audio endpoints. Streams raw MP3 bytes directly back to her vocal output nodes.
* **Payload:**
  ```json
  {
    "text": "Halo Kakak tercinta!",
    "voice": "nova",
    "model": "tts-1",
    "speed": 1.0
  }
  ```
* **Response:** Direct `audio/mpeg` stream.

### 🎤 POST `/api/tts/gemini`
* **Function:** Synthesizes speech using the high-fidelity native Gemini multimodal voice models. Returns base64 payload.
* **Payload:**
  ```json
  {
    "text": "Halo Kakak tercinta!",
    "voice": "Kore",
    "model": "gemini-3.1-flash-tts-preview"
  }
  ```
* **Response (JSON):**
  ```json
  {
    "audio": "T2dnUwACAAAAAAAAAAA..." // base64 audio data
  }
  ```

### 🖼️ POST `/api/ai/image-generation`
* **Function:** Generates visual scenery backdrops for Yui's viewport using the modern Google **Imagen 3** engine.
* **Payload:**
  ```json
  {
    "prompt": "Minimalist serene room with wooden floors, soft morning light filtering through high glass windows, anime style illustration",
    "ratio": "16:9",
    "negativePrompt": "blurry, low quality"
  }
  ```
* **Response (JSON):**
  ```json
  {
    "success": true,
    "url": "data:image/jpeg;base64,/9j/4AAQSkZJRg..." // Base64 Data URL representing the backdrop
  }
  ```

### 👁️ POST `/api/ai/vision`
* **Function:** Feeds base64 image captures into her Google Gemini visual sensory channels, allowing her to "see" and spontaneous-react to overlay image assets or web camera captures.
* **Payload:**
  ```json
  {
    "image": "data:image/jpeg;base64,/9j/4AAQSk...",
    "prompt": "Apa yang Kakak perlihatkan kepadamu?",
    "model": "gemini-2.5-flash"
  }
  ```
* **Response (JSON):**
  ```json
  {
    "text": "Wah, itu secangkir kopi hangat yang sangat nikmat! Kakak jangan lupa diminum ya sebelum dingin! 🌸"
  }
  ```

### 🔑 POST `/api/ai/verify`
* **Function:** Validates API key parameters against providers (Gemini, Puter, OpenAI, DeepSeek, Ollama) by performing safe test loopbacks.
* **Payload:**
  ```json
  {
    "provider": "gemini",
    "config": {
      "apiKey": "AIzaSy..."
    }
  }
  ```
* **Response (JSON):**
  ```json
  {
    "valid": true,
    "source": "gemini_api_direct",
    "maskedKey": "AIza...yKey"
  }
  ```

---

## 🤖 8. Telegram Gateway Routes (`telegramRouter.ts`)
Facilitates identity checks, message dispatching loops, and private Telegram user session listings.

### 📱 GET `/api/telegram/users`
* **Function:** Fetches registered private Telegram user profiles logged in Yui's database.
* **Response (JSON):**
  ```json
  [
    {
      "tg_id": 12345678,
      "username": "kakak_gede_tg",
      "first_name": "Aditya",
      "last_seen": 1713583600000,
      "context": "linked_identity:iden_123"
    }
  ]
  ```

### 📱 POST `/api/telegram/users/:id/context`
* **Function:** Updates or links a private Telegram session identifier directly to a specific master identity model ID.
* **Payload:**
  ```json
  {
    "context": "linked_identity:iden_123"
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true }
  ```

### 📱 POST `/api/telegram/message`
* **Function:** Manually sends an outbound message through Yui's Telegram Bot account to a targeted recipient chat ID.
* **Payload:**
  ```json
  {
    "chatId": "12345678",
    "text": "Selamat pagi Kakak! 🌸"
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true, "message": "Pesan Telegraf berhasil dikirim!" }
  ```

---

## ⚙️ 9. Synthesizer Daemon Routes (`synthesizerRouter.ts`)
Handles background consolidation parameters mapping out synthesized dialogue entries for neural fine-tuning sweeps.

### 📝 GET `/api/synthesizer/status`
* **Function:** Queries active synthesizer daemon compilation status parameters.
* **Response (JSON):**
  ```json
  {
    "active": true,
    "recordsProcessed": 140,
    "currentQueueSize": 0
  }
  ```

### 📝 POST `/api/synthesizer/trigger`
* **Function:** Directs the background synthesizer daemon to run a manual processing pass immediately.
* **Response (JSON):**
  ```json
  { "success": true, "message": "Manual compilation triggered." }
  ```

---

## 🛠️ 10. File & Search Tools Routes (`toolsRouter.ts`)
Provides robust file operations to her active cognitive loop (listing files, searching workspaces, moving, or deleting files) safely inside her `user_data/` directory.

### 📁 GET `/api/tools/files`
* **Function:** Scans and lists directories inside `user_data/`. Subjected to Path Jail protections.
* **Response (JSON):**
  ```json
  [
    {
      "name": "catatan_prompt.txt",
      "path": "user_data/catatan_prompt.txt",
      "size": 420,
      "isDirectory": false
    }
  ]
  ```

### 🔍 POST `/api/tools/search`
* **Function:** Executes string pattern searching (similar to grep) on files inside her permitted directories.
* **Payload:**
  ```json
  {
    "pattern": "yui"
  }
  ```
* **Response (JSON):**
  ```json
  [
    {
      "file": "user_data/catatan_prompt.txt",
      "line": 3,
      "text": "Yui adalah pelindung Kakak."
    }
  ]
  ```

### 📁 POST `/api/tools/copy`
* **Function:** Copies files inside her permitted directories.
* **Payload:**
  ```json
  {
    "source": "user_data/catatan.txt",
    "destination": "user_data/catatan_backup.txt"
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true }
  ```

### 📁 POST `/api/tools/move`
* **Function:** Moves or renames files inside permitted directories.
* **Payload:**
  ```json
  {
    "source": "user_data/catatan.txt",
    "destination": "user_data/catatan_baru.txt"
  }
  ```
* **Response (JSON):**
  ```json
  { "success": true }
  ```
