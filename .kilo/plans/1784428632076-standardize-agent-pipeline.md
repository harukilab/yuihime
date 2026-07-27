# Standardize Yuihime Agent Pipeline (JSON-mode, English prompts, clean utterance boundary)

## Context
The current cortex pipeline mixes two output formats: legacy **XML tags** (`<thought>`, `<animations>`, `<mood_impact>`, `<speech>`, `<tool_calls>`) and **JSON mode**. This dual-format design causes:
- `processedResponse` (the field downstream modules + verifier consume) sometimes leaks raw internal traces (`<thought>…<tool_calls>…` including error logs) on format-error/timeout fallbacks (`cortexThinkEngine.ts:907`, `:1419`).
- `NeuralVerifierModule` then false-positives on the word "error" inside that leaked trace, triggering needless self-correction.
- Telegram reaction crash (`REACTION_INVALID`) — separate, already fixed in `5970156`, but keep the allowlist.

Goal: bring the pipeline in line with mainstream agent architecture (single JSON tool-use format, English prompts, strict separation of internal reasoning/tool-trace vs final spoken utterance), reduce false positives, and make prompts maintainable via the centralized `PromptRegistry` (AGENTS.md §3).

Decisions confirmed with user:
- **Format**: JSON-mode ONLY (most common/standard in production agents: OpenAI/Anthropic/Google tool-use). Drop XML tag instructions from prompts.
- **Scope**: Include AGI modules too, but only by normalizing the **prompt templates** they compile from `PromptRegistry` (single source of truth). No large per-module rewrites (respects AGENTS.md §2 minimal cross-module edit).
- **Language**: All prompts/instructions internal = English (AGENTS.md §3). Persona speech to user stays ID/JP/EN per character (handled at output, not in prompts).

## Design (standard agent architecture)
Adopt the widely-proven **ReAct / tool-use loop** shape already present, with one enforced contract:
- `loopContext.rawResult` = raw model output (may contain internal fields, tool calls).
- `loopContext.toolsToCall` = parsed tool calls (internal, never surfaced as speech).
- `loopContext.processedResponse` = **ONLY the final spoken utterance** (clean text). On any fallback/format-error, set it to an in-character recovery speech string, NEVER to raw `<thought>/<tool_calls>` trace.
- Verifier inspects `processedResponse` only; no need to strip internal tags there (safety net still in `StandardizedProcessor`).

## Tasks (ordered)
1. **PromptRegistry: unify format to JSON, English.** (`src/core/PromptRegistry.ts`)
   - Rewrite `cortex:json_enforcement`, `cortex:error_correction`, `cortex:failsafe_reprocess`, `cortex:planning`, `cortex:repair_json` so they describe ONE JSON schema: `{ thought, final_answer, animations, mood_impact?, tool_calls: [{id,type,function:{name,arguments}}] }`. Remove all mentions of `<animations>/<mood_impact>/<tone>` XML.
   - Ensure every default template is written in precise English (per AGENTS.md §3). Replace any embedded Indonesian instructions in prompts with English.
   - Keep `compile()` + default fallback behavior (AGENTS.md §3: always provide default fallback).

2. **Cortex: enforce clean `processedResponse` boundary.** (`src/core/cortex/cortexThinkEngine.ts`)
   - In the format-error fallback branch (~line 905-907) and the post-loop fallback (~line 1419), set `loopContext.processedResponse` to a generated in-character recovery speech (e.g. reuse `cortex:failsafe_reprocess` style text) instead of `rawResultStr`/tool-trace. Keep raw trace in `rawResult`/`toolsToCall` only.
   - Remove the now-redundant inline XML-stripping reliance: downstream already expects clean `processedResponse`.
   - Ensure the system-prompt injection (~line 313-324) no longer references disabled XML tags; state JSON keys only.

3. **Verifier: inspect final utterance only.** (`src/modules/NeuralVerifierModule.ts`)
   - Keep the `StandardizedProcessor.sanitizeOutput` call added in `5970156` as a safety net (do NOT revert it — it is harmless and defends against any remaining leak).
   - Confirm keyword check runs on `sanitizeOutput(processedResponse)`; no special-casing needed beyond current.
   - Optional hardening: skip error-keyword check entirely if `processedResponse` contains no `<thought>`/`<tool_calls>` after sanitize (already guaranteed by task 2).

4. **AGI modules: normalize compiled prompts to English + JSON.** (via `PromptRegistry`)
   - Audit every AGI module that calls `PromptRegistry.getInstance().compile(...)` / `.get(...)` (YUIAGICoreModule, YuiAGIDaemon, DreamModule, SpontaneousProactiveModule, ProactiveVolitionModule, TopDownExecutiveControlModule, HighOrderMetacognitionModule, SelfAwarenessMirrorModule, NeuroSymbolicModule, AbstractReasoningModule, MemoryConsolidationModule, CognitiveIntegrityGuardianModule, CircadianRhythmModule, WeatherNewsEmpathyModule, ContinuousLearningMemoryModule, SomaticSensorGroundingModule).
   - Move any inline prompt strings into `PromptRegistry` templates (English, no XML tag leakage). Modules already import `PromptRegistry`, so this is template-level, not structural.
   - Specifically fix `NeuroSymbolicModule.ts:145` which still emits `<thought>` instruction text — rephrase to "Do not leak internal reasoning or raw tags into the final answer."
   - Do NOT change module logic/registration (AGENTS.md §2).

5. **Sanitizer stays as output-stage net.** (`src/core/kernel/processor.ts`)
   - Keep the `<tool_calls>/<animations>` strip added in `5970156`. This remains the single sanitization location for the output pipeline (FlowEngine/OutputRenderer), not duplicated in modules.

6. **Docs & commit.** (AGENTS.md §6, §10)
   - `python3 tools/update_log.py --type "Refactor" --title "..." --bullet "..." --bullet "..." --module "..."`
   - Update AGENTS.md §10 if needed (no change expected).
   - Commit + push to `main`.

## Files touched (estimated)
- `src/core/PromptRegistry.ts` (prompt templates → JSON/English)
- `src/core/cortex/cortexThinkEngine.ts` (processedResponse boundary)
- `src/modules/NeuralVerifierModule.ts` (verify, keep sanitize)
- `src/core/kernel/processor.ts` (unchanged logic, keep strip)
- `src/modules/agi/*.ts` (prompt template normalization via PromptRegistry; minimal)
- `UPDATE_LOG.md`, `MODULES.md` (via helper)

## Validation
- `npx tsc --noEmit` passes (lint script).
- Reproduce the original failure scenario: force a tool timeout (e.g. `run_command` to a dead host) → confirm log shows NO `[VERIFIER] Error keyword detected` false positive, and Telegram reaction uses only allowlisted emoji.
- Manual: send a message that triggers tool use + a network failure; verify Yui replies in-character (recovery speech) and verifier reports `valid`, not `corrected`.
- Grep check: no remaining `<animations>|<mood_impact>|<tone>` instruction text inside `PromptRegistry` default templates.

## Risks
- Changing `cortex:json_enforcement` schema wording may shift model output; mitigate by keeping the exact JSON key names (`thought`, `final_answer`, `animations`, `mood_impact`, `tool_calls`) unchanged.
- AGI module prompts in Indonesian: translating to English changes model behavior slightly; keep persona/character instructions minimal and rely on existing system prompt for personality.
- Do not touch `server.ts`, `App.tsx`, `src/core/kernel/` infrastructure (AGENTS.md §2 immutable core).

## Open questions
- None blocking. (User chose JSON-only + include AGI modules + English prompts.)
