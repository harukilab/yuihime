# HEARTBEAT.md - YuiHime Periodic Internal Tasks

## Every 15 Minutes
- Sync memory buffer with SQLite database via `StorageService`
- Run neural circuit health checks (`MoodStabilizerCircuit`, `MemoryRefinerCircuit`)
- Clear expired caches in registry and tool executor
- Verify Puter connection status and re-authenticate if stale
- Check Cortex state machine (`IDLE` / `SLEEPING` / `REFLECTING`)
- Validate cron scheduler (`CronModule`) is processing due tasks

## Hourly Health Checks
- Execute `executeSelfDirectedThought()` pulse (Cortex Background Loop)
- Run auto-dream cycle if cooldown has elapsed (`lastDreamCycle`)
- Log system metrics: memory usage, LLM provider latency, tool queue depth
- Verify all registered modules in `SystemRegistry` are responsive
- Check background nanobot circuits (`NeuralCircuitManager`) for stuck loops

## Daily Tasks
- Consolidate episodic memories into long-term semantic knowledge
- Run `LearningEngine.optimize()` and `LearningEngine.extractKnowledge()`
- Prune low-signal memories and expired dream records
- Generate insight reports from dream cycle distillations
- Optimize FTS5 keyword index and vector index in SQLite
- Rotate and validate encrypted secrets (XOR + keyfile integrity)
