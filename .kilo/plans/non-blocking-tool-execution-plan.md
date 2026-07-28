# Non-Blocking Background Tool Execution — Implementation Plan

## Context

The current `executeCortexThink()` in `cortexThinkEngine.ts` blocks on `Promise.all(toolPromises)` at line 1244. The user waits for all tools to finish before receiving any reply. The plan is to break this coupling so Yui can send an interim reply immediately and run tools in the background.

## Target Files

| File | Action |
|------|--------|
| `src/core/kernel/BackgroundToolDispatcher.ts` | NEW |
| `src/core/kernel/BackgroundToolTypes.ts` | NEW |
| `src/core/cortex/cortexThinkEngine.ts` | MODIFY |
| `src/core/kernel/NeuralInterface.ts` | MODIFY |
| `src/core/kernel/MultiChannelQueue.ts` | MODIFY |
| `src/core/RegistryInitializer.ts` | MODIFY |

---

## Task 1: Create Types (`src/core/kernel/BackgroundToolTypes.ts`)

Define shared interfaces used by both the dispatcher and cortex engine:

- `BackgroundToolCall` — `{ toolCallId, toolName, args, timeoutMs?, metaTimeoutMs?, attempt? }`
- `BackgroundToolResult` — `{ toolCallId, toolName, success, observation?, error?, durationMs }`
- `PendingToolSet` — `{ contextId, toolCalls: BackgroundToolCall[], promise: Promise<ToolResult[]>, results?: ToolResult[], status: 'pending' | 'completed' | 'failed', createdAt, completedAt? }`

---

## Task 2: Create `BackgroundToolDispatcher` (`src/core/kernel/BackgroundToolDispatcher.ts`)

Singleton class with:

### Fields
- `private pendingTools: Map<string, PendingToolSet>` — keyed by `contextId`
- `private queue: BackgroundToolCall[]` — pending execution queue
- `private activeWorkers: number` — current concurrency count
- `private readonly maxConcurrency: number` — default 4, read from `settings['tool-executor'].bgConcurrency` or fall back to 4
- `private cleanupInterval: NodeJS.Timeout` — runs every 10 minutes

### Methods
- `enqueue(contextId, toolCalls, state, context): Promise<BackgroundToolResult[]>`
  - Creates a `PendingToolSet` entry in the map
  - Adds all calls to the internal queue
  - Drains the queue via `this._drainQueue()`
  - Returns the promise that resolves when all tools complete
- `getPending(contextId): PendingToolSet | undefined`
- `drain(contextId): Promise<BackgroundToolResult[]>` — waits for and returns results
- `cancel(contextId): boolean` — removes pending set, rejects its promise
- `private _drainQueue(): void` — picks up to `maxConcurrency` pending calls, runs them with `Promise.allSettled`, stores results back in the `PendingToolSet`
- `private _cleanup(): void` — removes entries older than 5 minutes (TTL)
- `private _executeSingleTool(call, state, context): Promise<BackgroundToolResult>` — mirrors the per-tool execution logic from `cortexThinkEngine.ts` lines 1115-1223 (dedup schema validation, timeout race, retry loop), but returns a result object without side effects on the main think loop

### Key Design Decision
The `_executeSingleTool` method **duplicates** the per-tool execution logic from `cortexThinkEngine.ts` rather than refactoring it into a shared function, to minimize blast radius. The logic includes:
- Tool resolution via `SystemRegistry.getTool()`
- Dynamic synthesis fallback
- `_meta` stripping and schema validation
- `AbortSignal` handling
- Per-call timeout via `Promise.race`
- Retry with 1s backoff
- `Promise.race` with abort + timeout + tool execution

---

## Task 3: Modify `cortexThinkEngine.ts` — Phase 2 Integration

### 3a. At tool execution section (line ~1034), split the flow

**Current flow**: `Promise.all(toolPromises)` then process results inline.

**New flow**:
1. After deduplication (line ~1051), check `settings['tool-executor']?.bgEnabled !== false`
2. If background mode is ON:
   a. Emit interim reply: `eventBus.emit('OUTPUT_EMITTED', { response: indonesianStatus, isInternal: false })` — same status text already computed at lines 1073-1098
   b. Call `BackgroundToolDispatcher.enqueue(contextId, toolsToCall, state, augContext)` — returns a promise
   c. Instead of `await Promise.all(toolPromises)`, return an **immediate result** from the think loop that includes:
      - `response`: the interim text
      - `pendingToolRef`: the `contextId` so the caller can look up results later
      - `tool_calls`: the original tool calls list (for UI display)
      - `status`: `'tools_running'`
   d. **Do NOT break** — the loop continues but skips the `await Promise.all` blocking step. The tool results will be injected in the next turn.
3. If background mode is OFF (default for backward compat):
   - Keep existing `Promise.all(toolPromises)` flow unchanged

### 3b. Modify the return value at lines 1702-1778

When `pendingToolRef` is present on `immediateResult`:
- Set `response` to the interim text (already set above)
- Set `status: 'tools_running'`
- Set `pendingToolRef` to the contextId

### 3c. Add `pendingToolRef` field to the `immediateResult` object

Add to the result object at line 1702:
```
pendingToolRef: undefined,
status: 'completed',
```
Set `pendingToolRef` and `status` when background execution is used.

---

## Task 4: Modify `NeuralInterface.ts` — Inject Pending Results (Phase 2)

In `processNeuralInput()` (around line 318 where `cortex.think()` is called):

1. Before calling `cortex.think()`, check if there are pending tool results for this `contextId` via `BackgroundToolDispatcher.getPending(contextId)`
2. If pending results exist and are completed:
   - Drain them via `BackgroundToolDispatcher.drain(contextId)`
   - Build `tool_messages` from the results (similar to lines 1256-1291 in cortexThinkEngine.ts)
   - Inject them as a synthetic `tool` role message into the `memories` array passed to `cortex.think()`
3. If pending results exist but not completed:
   - Optionally: return early with "Yui sedang mengerjakan request kamu..." or let the cortex think loop handle it naturally

---

## Task 5: Modify `MultiChannelQueue.ts` — Handle Background Completion

### 5a. Emit tool completion events

In `BackgroundToolDispatcher`, emit events via `eventBus`:
- `TOOL_BG_STARTED` — when a tool begins execution
- `TOOL_BG_COMPLETED` — when a tool completes successfully
- `TOOL_BG_FAILED` — when a tool fails after all retries

### 5b. In `MultiChannelQueue.processNext()`

No structural change needed. The `OUTPUT_EMITTED` events from the dispatcher will be picked up by the existing event handlers in `web/src/app/effects.ts` and `web/src/core/socket.ts`.

### 5c. Add WS broadcast for tool status

Import `broadcastToWS` and emit status updates:
- On `TOOL_BG_STARTED`: `broadcastToWS({ type: 'tool_status', data: { contextId, status: 'running', toolName } })`
- On `TOOL_BG_COMPLETED`: `broadcastToWS({ type: 'tool_status', data: { contextId, status: 'completed', toolName, result } })`
- On `TOOL_BG_FAILED`: `broadcastToWS({ type: 'tool_status', data: { contextId, status: 'failed', toolName, error } })`

---

## Task 6: Register `BackgroundToolDispatcher` in `RegistryInitializer.ts`

1. Add static import: `import { BackgroundToolDispatcher } from './kernel/BackgroundToolDispatcher.js';`
2. Initialize the singleton during module registration: `BackgroundToolDispatcher.getInstance();`
3. No need to register it in `SystemRegistry` as a module — it's a kernel utility, not a cortex module.

---

## Task 7: Update `server.ts` if needed

Check if `BackgroundToolDispatcher` needs to be initialized during server bootstrap (e.g., passed database handle or settings). Likely not needed if it reads settings lazily via `cortexInstance.getSettings()`.

---

## Key Design Decisions & Rationale

1. **Duplication over refactoring for tool execution logic**: The per-tool execution block in `cortexThinkEngine.ts` (lines 1115-1223) is tightly coupled to the think loop state. Duplicating it in `BackgroundToolDispatcher._executeSingleTool()` avoids a risky refactor of the 120-line block. The duplication is bounded and can be consolidated later.

2. **`contextId` as the correlation key**: The existing `contextId` parameter flows through `NeuralInterface.processNeuralInput()` → `cortex.think()` → `executeCortexThink()`. Using it as the key for pending tool sets ensures results are routed back to the correct conversation thread.

3. **Opt-in via `settings['tool-executor'].bgEnabled`**: Backward compatibility is preserved. The default behavior (synchronous execution) is unchanged unless explicitly enabled in config.

4. **`Promise.allSettled` in the dispatcher**: Individual tool failures don't block other tools. The results array preserves which tools succeeded and which failed.

5. **Interim reply via existing `OUTPUT_EMITTED` event**: Reuses the existing event bus infrastructure that the web UI already subscribes to. No new event channel needed.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Tool mutates state while user continues chatting | Results are queued in `PendingToolSet`; applied only after `drain()` or next turn injection |
| Memory leak from pending promises | TTL of 5 minutes + cleanup scheduler runs every 10 minutes |
| Duplicate tool execution | `toolCallId` dedup key per `contextId` in the dispatcher queue |
| Backward compatibility | `bgEnabled` defaults to `false` → existing sync flow unchanged |
| Race condition on new message while tools running | `NeuralInterface` checks pending results before invoking cortex; blocks if not ready |
| State machine `EXECUTING` not transitioning back | `BackgroundToolDispatcher` does not touch `stateMachine`; the main thread handles state transitions in the sync path |

## Validation Steps

1. Run `npx tsc --noEmit` to verify no type errors
2. Verify `BackgroundToolDispatcher` singleton initializes correctly on server start
3. Test with `bgEnabled: true` — confirm interim reply is emitted before tools complete
4. Test with `bgEnabled: false` (default) — confirm existing synchronous behavior unchanged
5. Test concurrent tool execution across multiple `contextId`s
6. Verify `pendingToolRef` is correctly passed through `immediateResult` to `NeuralInterface`
7. Verify WS status events are emitted for `TOOL_BG_STARTED`, `TOOL_BG_COMPLETED`, `TOOL_BG_FAILED`
8. Verify cleanup removes expired pending entries after 5 minutes