# HEARTBEAT.md - YuiHime Periodic Internal Tasks

> Note: this file is a description of the internal heartbeat machinery. Schedules below are what the code actually runs; they are not a literal task list to execute manually.

## Continuous (every 30s)
- Run `executeSelfDirectedThought()` autonomous pulse (`Cortex.startAutonomousPulse(30000)`)
- Inside each pulse: `LearningEngine.optimize()` and `LearningEngine.extractKnowledge()`
- Log latency metrics to `performance_metrics` (memory usage / tool queue depth are not tracked)

## Short-Interval Circuits
- `MoodStabilizerCircuit`: drifts mood back toward baseline every 1 minute
- `MemoryRefinerCircuit`: tags/categorizes memories approximately every 120s

## Memory & Consolidation
- Memories are written synchronously to SQLite on ingest (no periodic buffer flush)
- Episodic → semantic consolidation via `MemoryConsolidationModule` (cron `memory-consolidation`, seeded every 6h: `0 */6 * * *`)
- Auto-dream cycle runs when the 24h cooldown has elapsed (`lastDreamCycle`, `AUTO_DREAM_COOLDOWN_MS`)
- Low-signal memories and expired dream records are pruned by DB auto-cleanup

## Index & Sync
- FTS5 keyword index synced every 30 minutes (`syncFtsIndex`)
- There is no vector index in the schema

## Security
- XOR encryption is used only for profile export/import with a fixed key; there is no keyfile, no rotation, and no validation loop

## Maintenance Notes
- `~/.yuihime/agent/` holds persona markdown files; there is no automated consistency audit of them
- `src/share/prompts/` holds persona/system templates; `build-info.json` is generated into `dist/` — no cleanup routine exists
