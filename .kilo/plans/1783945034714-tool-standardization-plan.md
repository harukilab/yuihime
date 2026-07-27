# Tool Standardization & Cleanup Plan

## Context
Yuihime's tool ecosystem has inconsistent output formats, hardcoded execution timeouts, near-duplicate tools, and no standard pagination syntax. The goal is to make tool calls predictable for AI agents and remove redundancy.

## Decisions Made

### 1. Standard Tool Output Envelope
All tools must return a uniform envelope so the LLM and cortex can parse results without custom logic per tool.

**Shape:**
```json
{
  "status": "success" | "error" | "timeout",
  "data": { ... tool-specific payload ... } | null,
  "error": { "code": string, "message": string, "retryable": boolean } | null,
  "metadata": {
    "durationMs": number,
    "toolId": string,
    "attempt": number
  }
}
```

**Rules:**
- On success: `status: "success"`, `data` holds the actual payload, `error` is `null`.
- On failure: `status: "error"`, `data` is `null`, `error` describes the failure.
- On timeout: `status: "timeout"`, `data` is `null`, `error.code: "TIMEOUT"`.
- `metadata` is always present.

### 2. LLM-Controlled Execution Parameters
The LLM must be able to tune timeout, retry, and polling behavior per tool call via standard args.

**New top-level args accepted by all tools:**
- `timeoutMs?: number` — override default timeout for this call.
- `retryLimit?: number` — max retries on transient failure.
- `pollIntervalMs?: number` — for long-running tools (e.g., TensorArt), interval between status checks.

**Cortex behavior:**
- `cortexThinkEngine.ts` reads these args from `tc.args` before executing.
- Falls back to `settings['tool-executor']` values when args are absent.
- Shell tools still respect `shellTimeoutMs` unless explicitly overridden.

### 3. Pagination Standard (`limit` + `offset`)
Tools that return lists must support `limit` and `offset` so the LLM can page through results.

**Targets:**
- `read_file` → add `limit` (lines) and `offset` (line start, 0-indexed).
- `search_chat` → already has `limit`; add `offset`.
- `search_memory` → already has `limit`; add `offset`.
- `view_logs` → already has `limit`; add `offset`.
- `view_system_logs` → already has `limit`; add `offset`.
- `list_files` → add `limit` and `offset`.
- `file_manager` (find action) → add `limit` and `offset`.

**Defaults:** `limit` defaults to existing values (e.g., 20 for chat, 10 for logs), `offset` defaults to 0.

### 4. Remove / Consolidate Duplicate Tools
Eliminate redundant tools and merge their capabilities.

**Merges:**
- `list_files` → absorbed into `file_manager` (`action: "list"`). Remove `list_files` tool.
- `file_automation` (`file_manipulate` folder) → merge `sort`, `archive`, `summarize`, `convert` into `file_manager` actions. Remove `file_automation` tool.
- `view_logs` + `view_system_logs` → merge into a single `view_logs` with `logType: "audit" | "llm" | "system" | "all"`. Remove `view_system_logs`.

**Keeps distinct:**
- `search_memory` (semantic/knowledge) vs `search_chat` (conversational history) — different data sources, keep both.
- `send_message` vs `send_file` — different payload types, keep both.
- `read_file` vs `edit_file_segment` vs `write_file` — distinct operations, keep all.

### 5. Prompt Pre-Processing Standardization
Before any tool execution, the cortex must inject a concise, structured tool preamble into the system prompt.

**New registry template: `cortex:tool_preamble`**
```
=== AVAILABLE TOOLS ===
You have access to the following tools. Call them using the JSON schema below.
${tool_list}
=== TOOL USAGE RULES ===
1. Use `tool_calls` array with OpenAI-native shape.
2. Set `timeoutMs`, `retryLimit`, `pollIntervalMs` in args if the task needs more/less time.
3. For list results, use `limit` and `offset` to paginate.
4. Keep `thought` under 1 sentence. If calling tools, leave `final_answer` empty.
```

**Injection point:** `cortexThinkEngine.ts` before the first LLM call, and re-injected after tool results are integrated into memory.

### 6. TensorArt Tool Specific Fixes
- Remove unsupported params from manifest: `negative_prompt`, `cfg_scale`, `steps`, `model_id`.
- Keep only: `prompt`, `width`, `height`.
- Return standard envelope with `data.imageUrl`, `data.localPath`, `data.jobId`.
- Support `timeoutMs` and `pollIntervalMs` from LLM args.

## Files to Modify

| File | Change |
|------|--------|
| `src/drivers/tools/*/index.ts` | Wrap returns in standard envelope |
| `src/drivers/tools/*/manifest.json` | Add `limit`/`offset` where applicable; prune TensorArt params |
| `src/core/cortex/cortexThinkEngine.ts` | Read `timeoutMs`/`retryLimit`/`pollIntervalMs` from `tc.args`; inject tool preamble |
| `src/core/PromptRegistry.ts` | Add `cortex:tool_preamble` template |
| `src/core/openaiTools.ts` | Ensure tool result messages include `metadata` |
| `src/core/available_tools.json` | Regenerate at boot (auto via RegistryInitializer) |
| `src/drivers/tools/list_files/` | DELETE after merging into `file_manager` |
| `src/drivers/tools/file_manipulate/` | DELETE after merging into `file_manager` |
| `src/drivers/tools/view_system_logs/` | DELETE after merging into `view_logs` |

## Validation Plan

1. **Unit check**: Run `npx tsx --check` on modified tool files.
2. **Integration check**: Start YuiHime, verify `available_tools.json` regenerates without deleted tools.
3. **LLM prompt check**: Inspect system prompt to confirm tool preamble appears and deleted tool IDs are absent.
4. **Functional check**: Run TensorArt generation with new envelope and LLM-provided `timeoutMs`.
5. **Pagination check**: Call `read_file` with `limit` + `offset`; verify correct slice is returned.

## Open Questions
- Should `file_manager` action enum be expanded to cover all merged behaviors (`list`, `sort`, `archive`, `summarize`, `convert`)? **Recommended: yes, single unified file tool.**
- Should pagination defaults be hardcoded in manifests or loaded from `config.toml`? **Recommended: hardcoded defaults in manifest, overridable by LLM args.**
- Should the standard envelope be enforced server-side in `toolsRouter.ts` or left to each tool module? **Recommended: enforced in each tool module for simplicity, with cortex fallback wrapping.**
