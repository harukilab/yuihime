# YuiHime Tool System Standardization Plan

## 1. Context & Current State

### 1.1 Tool Inventory (27 registered tools)
Current tools in `src/drivers/tools/`:
- `calculator`, `code_interpreter`, `download_file`, `edit_file`, `emotion_adjust`, `file_automation`, `file_manager`, `file_search`, `get_current_time`, `github`, `install_addon`, `list_files`, `manage_cron`, `manage_identities`, `manage_pairing`, `messaging_integration`, `overlay_control`, `pair_account`, `plugin-installer`, `python_interpreter`, `read_file`, `run_command`, `run_lua`, `scrape_web`, `search_chat`, `search_memory`, `send_file`, `send_message`, `set_emotion`, `tensorart_generate`, `update_user_profile`, `view_logs`, `view_system_logs`, `web_search`, `write_file`

### 1.2 Identified Duplicates / Overlaps
| Tool A | Tool B | Overlap |
|--------|--------|---------|
| `view_logs` | `view_system_logs` | Both retrieve system/audit/LLM logs |
| `search_memory` | `search_chat` | Both search past conversations/memories |
| `file_automation` | `file_manager` | Both manipulate files (sort/archive vs copy/move/delete) |
| `write_file` | `edit_file` | Both modify file content |
| `run_command` | `code_interpreter` / `run_python` / `run_lua` | All execute code/commands |
| `download_file` | `scrape_web` | Both fetch external web content |
| `send_file` | `messaging_integration` | Both deliver content to channels |

### 1.3 Current Tool Output Issues
- `ToolResponse` interface in `src/services/tools.ts` defines many optional fields but tools return inconsistent shapes
- Some tools return raw API JSON, others wrap in `{success, content}`, others return `{stdout, stderr}`
- No canonical output envelope enforced at the tool driver level

### 1.4 Current Prompt Structure
- Tool descriptions are injected into system prompt via `PromptManager.ts` using inline XML tags (`<tool_call>`)
- No centralized tool-specific prompt templates in `PromptRegistry`
- Tool call syntax instruction is hardcoded in `toolsTemplate` string

### 1.5 Current Loop/Timeout
- `maxIterations = 3` is hardcoded in `cortexThinkEngine.ts:277`
- Timeout read from `tool-executor` config (`timeoutMs`, `shellTimeoutMs`)
- Retry logic exists but maxAttempts is config-driven, not LLM-adjustable
- No mechanism for LLM to request extended iterations or timeouts

## 2. Goals

1. **Standardize tool outputs** to a canonical envelope consumable by AI agents
2. **Restructure tool prompts** into centralized, parameterized templates in `PromptRegistry`
3. **Make loop/timeout LLM-configurable** via tool call arguments or system context
4. **Eliminate duplicate tools** by merging overlapping capabilities
5. **Adopt standard AI agent tool syntax** (OpenAI-compatible with pagination params like `limit`/`offset`)

## 3. Decisions Required

### 3.1 Duplicate Tool Consolidation Strategy
**Recommended approach**: Merge by capability, keep the more general tool, update aliases in `toolNormalizer.ts`.

| Keep | Retire | Migration |
|------|--------|-----------|
| `view_logs` | `view_system_logs` | Add `type: "all"` enum to `view_logs` |
| `search_chat` | `search_memory` | Merge memory+chat search into `search_chat` with `scope` param |
| `file_manager` | `file_automation` | Add `action` variants to `file_manager` for sort/archive/summarize |
| `edit_file` | `write_file` | Keep both but clarify: `write_file` = full overwrite, `edit_file` = surgical replace |
| `run_command` | — | Keep; `code_interpreter`/`run_python`/`run_lua` stay as specialized |
| `scrape_web` | `download_file` | Add `extractText` mode to `scrape_web`; keep `download_file` for binary saves |
| `send_message` | `send_file` | Add `attachment` param to `send_message` |

### 3.2 Canonical Tool Output Envelope
**Recommended format**:
```json
{
  "success": boolean,
  "data": any,
  "error": string | null,
  "metadata": {
    "tool": string,
    "duration_ms": number,
    "timestamp": string
  }
}
```
- All tool drivers must return this shape
- `ToolService.parseAndValidate` enforces it
- Legacy fields (`stdout`, `stderr`, `content`) mapped into `data`

### 3.3 LLM-Configurable Timeout/Loop
**Recommended approach**: Allow LLM to pass `_meta` object in tool arguments:
```json
{
  "function": {
    "name": "read_file",
    "arguments": {
      "filename": "user_data/notes.txt",
      "_meta": {
        "timeout_ms": 120000,
        "priority": "high"
      }
    }
  }
}
```
- `_meta` fields stripped before reaching tool execution
- Cortex loop reads `_meta.timeout_ms` to override per-call timeout
- LLM can also emit `tool_calls` with `function.arguments.max_iterations_override` to request more turns (capped at config ceiling)

### 3.4 Standard Tool Syntax (Pagination)
**Recommended additions** to file-reading/listing tools:
- `read_file`: add `limit` (max chars), `offset` (char start), `line_start`, `line_end`
- `list_files`: add `limit`, `offset` for paginated directory listings
- `search_chat` / `view_logs`: already have `limit`, add `offset`

## 4. Implementation Plan

### Phase 1: Canonical Output Envelope
1. Update `src/services/tools.ts` `ToolResponse` interface to match canonical shape
2. Update `ToolService.parseAndValidate` to enforce canonical shape
3. Update all tool drivers (`src/drivers/tools/*/index.ts`) to wrap outputs
4. Update `cortexThinkEngine.ts` tool result handling (lines 1073-1089) to use canonical fields

### Phase 2: Tool Consolidation
1. **Merge `view_system_logs` → `view_logs`**:
   - Add `type: "all"` to `view_logs` manifest
   - Update `toolNormalizer.ts` alias map: `view_system_logs` → `view_logs`
   - Delete `src/drivers/tools/view_system_logs/`
2. **Merge `search_memory` → `search_chat`**:
   - Add `scope: "memory" | "chat" | "all"` to `search_chat` manifest
   - Update `search_chat/index.ts` to handle both scopes
   - Update alias map
   - Delete `src/drivers/tools/file_search/`
3. **Merge `file_automation` → `file_manager`**:
   - Add actions `sort`, `archive`, `summarize`, `convert` to `file_manager`
   - Update alias map
   - Delete `src/drivers/tools/file_manipulate/`
4. Keep `write_file` + `edit_file` but clarify manifests
5. Update `CustomToolsLoader.ts` if any custom tools reference retired IDs

### Phase 3: LLM-Configurable Loop/Timeout
1. Add `_meta` extraction in `cortexThinkEngine.ts` before tool execution (around line 978)
2. Pass per-call timeout from `_meta.timeout_ms` to `Promise.race` timeout promise
3. Add `max_iterations_override` support: if LLM requests it, validate against `tool-executor.maxIterationsCeiling` config
4. Document `_meta` in tool prompt template

### Phase 4: Standard Tool Syntax & Prompt Restructuring
1. Add pagination params to `read_file`, `list_files`, `search_chat`, `view_logs` manifests
2. Update corresponding `index.ts` implementations to honor `limit`/`offset`/`line_start`/`line_end`
3. Create `PromptRegistry` entries for tool call syntax:
   - `tools:syntax_openai` — canonical OpenAI tool_calls format
   - `tools:syntax_pagination` — limit/offset conventions
   - `tools:output_format` — what the LLM should expect back
4. Update `PromptManager.ts` `toolsTemplate` to reference `PromptRegistry` instead of hardcoded XML
5. Add per-tool `configSchema.prompt` textarea in manifests for LLM-tunable tool instructions

### Phase 5: Tool Normalizer & Alias Hygiene
1. Audit `toolNormalizer.ts` aliases — remove retired tool IDs
2. Add aliases for new consolidated tool names
3. Ensure parameter normalization covers new unified tools

## 5. Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Breaking existing custom tools referencing retired IDs | Keep alias map entries pointing retired IDs to new ones for 1 major version |
| LLM sending invalid `_meta` | Validate and ignore unknown `_meta` keys; log warnings |
| Tool output shape change breaks downstream consumers | Version the envelope; add `ToolResponse.v2` flag in config |
| Pagination params not honored by backend API | Update `src/core/server/routes/toolsRouter.ts` endpoints to accept new params |

## 6. Validation Steps

1. Run existing tests (if any): `npm test` or equivalent
2. Lint: `npm run lint`
3. Typecheck: `npm run typecheck`
4. Manual smoke test each consolidated tool via API
5. Verify `available_tools.json` regenerates correctly
6. Confirm `PromptRegistry` compiles all new templates without errors

## 7. Open Questions

1. Should `code_interpreter`/`run_python`/`run_lua` be merged under `run_command` with a `language` param, or kept separate? **Recommendation: Keep separate** — different execution contexts and security boundaries.
2. Should `_meta` be a reserved prefix, or use a separate top-level key like `meta`? **Recommendation: `_meta`** — clearly distinguishes control data from tool arguments.
3. Should retired tool directories be deleted or kept as thin wrappers? **Recommendation: Delete after alias map is stable** — reduces maintenance surface.
