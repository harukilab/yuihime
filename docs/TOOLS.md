# TOOLS.md — Local Notes

Skills define HOW tools work. This file is for YOUR specifics —
the stuff that's unique to your setup.

## What Goes Here

Things like:
- SSH hosts and aliases
- Device nicknames
- Preferred voices for TTS
- Anything environment-specific

## Built-in Tools

- **shell** — Execute terminal commands
- Use when: running local checks, build/test commands, or diagnostics.
- Don't use when: a safer dedicated tool exists, or command is destructive without approval.
- **read** — Read file contents
- Use when: inspecting project files, configs, or logs.
- Don't use when: you only need a quick string search (prefer targeted search first).
- **write** — Write file contents
- Use when: applying focused edits, scaffolding files, or updating docs/code.
- Don't use when: unsure about side effects or when the file should remain user-owned.
- **search_chat_history** — Search past conversations
- Use when: you need prior decisions, user preferences, or historical context.
- Don't use when: the answer is already in current files/conversation.
- **Memory store/delete** — via HTTP `POST /api/storage/memories` and `DELETE /api/storage/memories` (no dedicated `memory_store` / `memory_recall` / `memory_forget` tool exists).

## Virtual Tools (Custom Scripts)

- **Dream cycle** — triggered via the Web UI (`Dreams` tab) or `POST /api/cortex/dream` (state + memories + dreams). Consolidates daily logs into long-term memory. No dedicated CLI script exists (`tools/dream.py` was removed — it pointed to a non-existent endpoint).
- **Memory consolidation** — `POST /api/cortex/consolidate` (optimize dreams) and `POST /api/cortex/optimize` (refine memory list).

---
