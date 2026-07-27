# Missing Tools Implementation Plan

This document outlines the implementation plans for tools/modules that are currently missing from YuiHime. Each plan includes the purpose, architecture, dependencies, and implementation steps.

---

## 1. Weather API Fetcher

**Purpose**: Provide real-time weather data to Yui's cognitive loop, enabling weather-aware empathy responses via `WeatherNewsEmpathyModule`.

**Architecture**:
- New tool driver at `src/drivers/tools/weather_fetch/index.ts`
- Config schema with `apiKey` (OpenWeatherMap), `defaultCity`, `units` (metric/imperial)
- Exposed as `weather_fetch` in `available_tools.json`
- Uses OpenWeatherMap Current Weather API (free tier: 1000 calls/day)

**Dependencies**:
- OpenWeatherMap API key (user-configurable)
- No additional npm packages needed (uses native `fetch`)

**Implementation Steps**:
1. Create `src/drivers/tools/weather_fetch/index.ts` with `WeatherFetchTool` module
2. Create `src/drivers/tools/weather_fetch/manifest.json`
3. Add `weather_fetch` entry to `src/core/available_tools.json`
4. Register in `RegistryInitializer.ts` via auto-discovery
5. Update `docs/TOOLS.md` with weather tool documentation

---

## 2. News Scraper

**Purpose**: Fetch and summarize news articles for Yui to reference in conversations, enabling informed discussions about current events.

**Architecture**:
- New tool driver at `src/drivers/tools/news_fetch/index.ts`
- Config schema with `apiKey` (NewsAPI.org), `defaultLanguage`, `maxResults`
- Exposed as `news_fetch` in `available_tools.json`
- Uses NewsAPI.org (free tier: 100 calls/day) or RSS feed fallback

**Dependencies**:
- NewsAPI.org API key (user-configurable)
- Optional: `rss-parser` npm package for RSS fallback

**Implementation Steps**:
1. Create `src/drivers/tools/news_fetch/index.ts` with `NewsFetchTool` module
2. Create `src/drivers/tools/news_fetch/manifest.json`
3. Add `news_fetch` entry to `src/core/available_tools.json`
4. Register in `RegistryInitializer.ts` via auto-discovery
5. Update `docs/TOOLS.md` with news tool documentation

---

## 3. Translation Tool

**Purpose**: Enable Yui to translate text between languages, supporting multi-language conversation contexts.

**Architecture**:
- New tool driver at `src/drivers/tools/translate/index.ts`
- Config schema with `apiKey` (Google Translate / LibreTranslate), `defaultSourceLang`, `defaultTargetLang`
- Exposed as `translate` in `available_tools.json`
- Supports free tier (LibreTranslate) and paid tier (Google Cloud Translation)

**Dependencies**:
- LibreTranslate (self-hosted, free) or Google Cloud Translation API key
- No additional npm packages for LibreTranslate; `@google-cloud/translate` for Google

**Implementation Steps**:
1. Create `src/drivers/tools/translate/index.ts` with `TranslateTool` module
2. Create `src/drivers/tools/translate/manifest.json`
3. Add `translate` entry to `src/core/available_tools.json`
4. Register in `RegistryInitializer.ts` via auto-discovery
5. Update `docs/TOOLS.md` with translation tool documentation

---

## 4. Video Downloader

**Purpose**: Download video/audio from YouTube, TikTok, and other platforms for Yui to analyze or reference content.

**Architecture**:
- New tool driver at `src/drivers/tools/video_download/index.ts`
- Config schema with `ytdlpPath` (path to yt-dlp binary), `downloadDir`, `maxFileSizeMB`
- Exposed as `video_download` in `available_tools.json`
- Uses `yt-dlp` CLI tool (requires separate installation)
- Sandboxed to `downloadDir` with file size limits

**Dependencies**:
- `yt-dlp` binary installed on the system
- Optional: `ffmpeg` for audio extraction

**Implementation Steps**:
1. Create `src/drivers/tools/video_download/index.ts` with `VideoDownloadTool` module
2. Create `src/drivers/tools/video_download/manifest.json`
3. Add `video_download` entry to `src/core/available_tools.json`
4. Register in `RegistryInitializer.ts` via auto-discovery
5. Add `ytdlpPath` validation to sandbox path verification
6. Update `docs/TOOLS.md` with video downloader documentation

---

## 5. Headless Browser Automation

**Purpose**: Enable Yui to interact with web pages dynamically (fill forms, click buttons, extract dynamic content) beyond static HTTP fetching.

**Architecture**:
- New tool driver at `src/drivers/tools/browser_automation/index.ts`
- Config schema with `enabled` (boolean), `defaultViewport`, `timeoutMs`
- Exposed as `browser_automation` in `available_tools.json`
- Uses Puppeteer (Chromium) or Playwright for headless browser control
- Sandboxed: only allowed domains per domain allowlist

**Dependencies**:
- `puppeteer` or `playwright` npm package
- Chromium/Chromium binary (bundled with puppeteer or system-installed)

**Implementation Steps**:
1. Create `src/drivers/tools/browser_automation/index.ts` with `BrowserAutomationTool` module
2. Create `src/drivers/tools/browser_automation/manifest.json`
3. Add `browser_automation` entry to `src/core/available_tools.json`
4. Register in `RegistryInitializer.ts` via auto-discovery
5. Add domain allowlist validation in sandbox
6. Update `docs/TOOLS.md` with browser automation documentation

---

## 6. OCR / Image Text Extraction

**Purpose**: Extract text from images, enabling Yui to read screenshots, documents, and visual content.

**Architecture**:
- New tool driver at `src/drivers/tools/ocr/index.ts`
- Config schema with `engine` (tesseract | easyocr | google_vision), `defaultLanguage`
- Exposed as `ocr` in `available_tools.json`
- Tesseract.js for local (free), Google Vision API for cloud (paid)

**Dependencies**:
- `tesseract.js` npm package (local, free)
- Optional: `@google-cloud/vision` for Google Vision API

**Implementation Steps**:
1. Create `src/drivers/tools/ocr/index.ts` with `OCRTool` module
2. Create `src/drivers/tools/ocr/manifest.json`
3. Add `ocr` entry to `src/core/available_tools.json`
4. Register in `RegistryInitializer.ts` via auto-discovery
5. Update `docs/TOOLS.md` with OCR documentation

---

## 7. Email Tool

**Purpose**: Send and receive emails, enabling Yui to communicate via email on behalf of the user.

**Architecture**:
- New tool driver at `src/drivers/tools/email/index.ts`
- Config schema with `smtpHost`, `smtpPort`, `smtpUser`, `smtpPass`, `imapHost`, `imapPort`, `imapUser`, `imapPass`
- Exposed as `email_send` and `email_receive` in `available_tools.json`
- Uses Nodemailer for SMTP send, IMAP for receive
- Encrypted credentials (XOR + keyfile per AGENTS.md security spec)

**Dependencies**:
- `nodemailer` npm package
- `imap-simple` npm package for IMAP receive

**Implementation Steps**:
1. Create `src/drivers/tools/email/index.ts` with `EmailSendTool` and `EmailReceiveTool` modules
2. Create `src/drivers/tools/email/manifest.json`
3. Add `email_send` and `email_receive` entries to `src/core/available_tools.json`
4. Register in `RegistryInitializer.ts` via auto-discovery
5. Implement encrypted credential storage per AGENTS.md security spec
6. Update `docs/TOOLS.md` with email tool documentation

---

## 8. Calendar / Reminder Tool

**Purpose**: Schedule events and set reminders, enabling Yui to manage the user's time and notify them of upcoming events.

**Architecture**:
- New tool driver at `src/drivers/tools/calendar/index.ts`
- Config schema with `defaultTimeZone`, `reminderLeadTimeMinutes`
- Exposed as `calendar_create`, `calendar_list`, `calendar_remind` in `available_tools.json`
- Uses SQLite for local event storage (persisted in `.yuihime/data/`)
- Optional: Google Calendar API integration for sync

**Dependencies**:
- `better-sqlite3` npm package (already a project dependency)
- Optional: `googleapis` for Google Calendar sync

**Implementation Steps**:
1. Create `src/drivers/tools/calendar/index.ts` with calendar tool modules
2. Create `src/drivers/tools/calendar/manifest.json`
3. Add `calendar_create`, `calendar_list`, `calendar_remind` entries to `src/core/available_tools.json`
4. Register in `RegistryInitializer.ts` via auto-discovery
5. Create `.yuihime/data/calendar.db` SQLite schema
6. Update `docs/TOOLS.md` with calendar tool documentation

---

## 9. Dream Engine Script (`tools/dream.py`)

**Purpose**: Virtual tool script referenced in `docs/TOOLS.md` as `python3 tools/dream.py` for performing dream cycles (memory consolidation).

**Architecture**:
- New file at `tools/dream.py`
- CLI script that triggers the dream engine consolidation process
- Reads from SQLite memory DB, processes unconsolidated memories, writes summaries
- Called by Yui's cognitive loop or manually by the user

**Dependencies**:
- Python 3.x
- `sqlite3` (stdlib)
- Path to YuiHime's `.yuihime/data/` directory

**Implementation Steps**:
1. Create `tools/dream.py` with dream cycle logic
2. Add shebang and CLI argument parsing
3. Implement memory consolidation logic (read unprocessed memories, generate summaries, mark as consolidated)
4. Update `docs/TOOLS.md` with correct path and usage instructions
5. Add `tools/dream.py` to `.gitignore` if it contains environment-specific paths

---

## 10. Vector Search (Cosine Similarity) Verification

**Purpose**: Verify that the memory engine fully implements the AGENTS.md specification for SQLite BLOB + cosine vector search with FTS5 + BM25 hybrid fusion.

**Architecture**:
- Audit `src/core/database/` and `src/modules/MemoryModule.ts` for vector search implementation
- Verify cosine similarity computation is functional
- Verify FTS5 + BM25 hybrid fusion is working
- Verify markdown-aware chunking is implemented

**Implementation Steps**:
1. Audit current memory search implementation
2. If vector search is incomplete, implement cosine similarity using SQLite VSS extension or custom implementation
3. If FTS5 + BM25 hybrid fusion is missing, implement fusion ranking
4. If markdown-aware chunking is missing, implement it
5. Add unit tests for vector search, keyword search, and hybrid fusion
6. Update `docs/MEMORY.md` with implementation status

---

## 11. Prompt Registry Compliance Audit

**Purpose**: Ensure all modules comply with the AGENTS.md mandate that no prompts are hardcoded in `run` functions. All prompts must be registered in `PromptRegistry`.

**Architecture**:
- Audit all 25+ AGI modules and core modules for hardcoded prompts
- Move any hardcoded prompts to `PromptRegistry` with proper `module-id:purpose` namespace
- Expose prompts as `textarea` in `configSchema`
- Use `PromptRegistry.compile()` in all `run` functions

**Implementation Steps**:
1. Scan all modules for hardcoded prompt strings in `run` functions
2. Create `PromptRegistry` entries for each found prompt
3. Update module `run` functions to use `PromptRegistry.compile()`
4. Add `textarea` fields to `configSchema` for user-tunable prompts
5. Add fallback default prompts to `PromptRegistry`
6. Write audit report in `docs/PROMPT_REGISTRY_AUDIT.md`

---

## Implementation Priority

| Priority | Tool | Reason |
|----------|------|--------|
| P0 | Weather API Fetcher | Required for `WeatherNewsEmpathyModule` to function with real data |
| P0 | Vector Search Verification | Architecture-critical per AGENTS.md specification |
| P1 | Translation Tool | High utility for multi-language conversations |
| P1 | News Scraper | Required for informed current-events responses |
| P2 | OCR / Image Text Extraction | Enables visual content understanding |
| P2 | Calendar / Reminder Tool | Practical utility for user productivity |
| P3 | Video Downloader | Useful but requires external binary (`yt-dlp`) |
| P3 | Headless Browser Automation | Complex dependency (Puppeteer/Playwright) |
| P3 | Email Tool | Requires secure credential management |
| P4 | Dream Engine Script | Documentation fix for existing reference |
| P4 | Prompt Registry Audit | Internal quality assurance |