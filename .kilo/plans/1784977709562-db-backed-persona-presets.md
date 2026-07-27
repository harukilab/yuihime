# Plan: Active Profiles Presets → DB-backed Persona System

## Goal
Active Profiles Presets in `CharacterTab.tsx` must be able to change Yui's personality live by persisting custom persona cards to SQLite and wiring them into the server-side persona resolver that feeds `PromptManager.ts`.

## Current State
- `characterCards` is a **local-only** React state synced to `localStorage` and cloned from `DEFAULT_NEURAL_CORES`.
- `handleSaveCard` in `CharacterTab.tsx` does **not** write to the backend.
- Server-side persona resolution in `cortexRouter.ts`, `NeuralInterface.ts`, and `cortexThinkEngine.ts` resolves **only** from the hardcoded `DEFAULT_NEURAL_CORES`.
- `PromptManager.ts` already consumes `context.activePersona.systemPrompt` correctly.
- No DB table exists for custom personas.

## Decision: Storage Layer
Use a **dedicated `custom_personas` table** in SQLite instead of `custom_storage` key-value. Rationale: personas have structured fields (traits, behavior, modules, artistry, settings) that benefit from a proper schema and queryability.

### Schema
```sql
CREATE TABLE IF NOT EXISTS custom_personas (
  id TEXT PRIMARY KEY,
  name TEXT,
  nickname TEXT,
  description TEXT,
  creatorNotes TEXT,
  version TEXT DEFAULT '1.0.0',
  systemPrompt TEXT,
  traits TEXT,        -- JSON array
  color TEXT,
  archetype TEXT,
  behavior TEXT,      -- JSON: { firstMessage, scenario, examples }
  modules TEXT,       -- JSON: { enableMic, enableWebSearch, enableMcp }
  artistry TEXT,      -- JSON: { avatar, expression, voiceSpeed }
  settings TEXT,      -- JSON: { temperature, systemPrompt }
  createdAt INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updatedAt INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
```

## API Surface (`systemRouter.ts`)
Add CRUD endpoints under `/api/system/personas`:
- `GET /api/system/personas` — return all custom personas + currently active id
- `POST /api/system/personas` — upsert a persona (body: full persona card object)
- `DELETE /api/system/personas/:id` — delete a persona
- `POST /api/system/personas/activate` — set `agent_state.activePersonaId` to the given id

## Backend Wiring: Persona Resolver
Update three locations where `activePersona` is resolved from `DEFAULT_NEURAL_CORES`:
1. `cortexRouter.ts` (~lines 336-337, 884-885)
2. `NeuralInterface.ts` (~line 229)
3. `cortexThinkEngine.ts` (~lines 239-260)

New resolution order:
1. Check `custom_personas` table for `activePersonaId`
2. If found, return it
3. Else fall back to `DEFAULT_NEURAL_CORES.find(c => c.id === targetId)`
4. Else fall back to `DEFAULT_NEURAL_CORES[1]` (hiyori)
5. For `auto` mode, keep existing keyword-based auto-selection logic

Edge case: if `activePersonaId` points to a deleted custom persona, reset `agent_state.activePersonaId` to `'auto'`.

## Frontend Wiring
### `ModularSettings.tsx`
- On mount, fetch `GET /api/system/personas` and merge with `DEFAULT_NEURAL_CORES`.
- Custom personas should take precedence over default cores if they share an id (unlikely given `card_<timestamp>` IDs).
- Persist active selection to both `localStorage` and backend via `POST /api/system/personas/activate` when `activeCardId` changes.

### `CharacterTab.tsx`
- Update `handleSaveCard` to POST to `/api/system/personas` instead of only updating local state.
- After successful save, refresh `characterCards` from the API response.
- Make "Upload Card" functional: accept `.json` files containing a persona card object, parse, POST to `/api/system/personas`.

## Data Flow
```
UI (CharacterTab.tsx)
  ↓ save → POST /api/system/personas
SQLite custom_personas table
  ↓ read on think request
cortexRouter / NeuralInterface / cortexThinkEngine
  ↓ resolve activePersona
context.activePersona
  ↓ already consumed
PromptManager.ts → injects systemPrompt into final prompt
```

## Validation
- Verify custom persona appears in CharacterTab list after save.
- Verify selecting it updates `agent_state.activePersonaId`.
- Verify `PromptManager.ts` assembled prompt contains `<active_cognitive_focus_state>` block with custom `systemPrompt`.
- Verify fallback to default core works when custom persona is deleted.
- Verify `auto` mode still auto-selects based on input keywords.

## Out of Scope
- `.png` character card parsing (TavernAI/AGI format). MVP accepts `.json` only.
- Multi-user persona isolation (single local-user model assumed).
- Persona versioning/history beyond `updatedAt` timestamp.
