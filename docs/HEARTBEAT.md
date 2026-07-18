# HEARTBEAT.md - YuiHime Periodic Internal Tasks

## Every 15 Minutes
- Sync memory buffer with SQLite database via `StorageService`
- Run neural circuit health checks (`MoodStabilizerCircuit`, `MemoryRefinerCircuit`)
- Clear expired caches in registry and tool executor
- Verify active LLM provider connection and re-authenticate if stale
- Check Cortex state machine (`IDLE` / `SLEEPING` / `REFLECTING`)
- Validate cron scheduler (`CronModule`) is processing due tasks

## Hourly Health Checks
- Execute `executeSelfDirectedThought()` pulse (Cortex Background Loop)
- Run auto-dream cycle if cooldown has elapsed (`lastDreamCycle`)
- Log system metrics: memory usage, LLM provider latency, tool queue depth
- Verify all registered modules in `SystemRegistry` are responsive
- Check background nanobot circuits (`NeuralCircuitManager`) for stuck loops
- Repair truncated or malformed prompt caches in `PromptRegistry`

## Daily Tasks
- Consolidate episodic memories into long-term semantic knowledge
- Run `LearningEngine.optimize()` and `LearningEngine.extractKnowledge()`
- Prune low-signal memories and expired dream records
- Generate dream insight notes from `DreamModule` distillations (1x daily)
- Optimize FTS5 keyword index and vector index in SQLite
- Rotate and validate encrypted secrets (XOR + keyfile integrity)
- Audit persona markdown files in `.yuihime/agent/` for consistency with active config
- Clean unused prompt artifacts from `src/share/prompts/` (e.g., stale `build-info.json`)
