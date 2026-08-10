# YuiHime `tools/` Reference

> Quick reference for every script in `tools/`. External agents should read this
> file to know what a tool does + how to invoke it, without opening each script.

Common env for all tools: `YUIHIME_SYSTEM_ROOT` (data root, default `$HOME/.yuihime`).
All shell tools fall back to `$HOME/.yuihime` automatically.

## Core daemon lifecycle

| Script | Purpose | Key commands |
|---|---|---|
| `yui-daemon.sh` | Terminal twin of the `/daemon` bot command. Default is **no PM2** (local process + watchdog). | `start [dev\|prod]`, `stop`, `restart [dev\|prod]`, `status`, `logs [-live] [N]`, `rebuild`, `autoboot [dev\|prod]`, `autoboot off`, `help`. PM2 mode via `--pm2` / `YUIHIME_PM2=1`. |
| `yui-watchdog.sh` | Supervisor: probes `/api/health`, auto-restarts daemon on hang/crash. | `start [dev\|prod] [--pm2\|--no-pm2]`, `restart ...`, `stop`, `status`, `log`. Env: `YUIHIME_WATCHDOG_INTERVAL` (10s), `_MAX_TIME` (8s), `_FAILURES` (2), `_BOOT` (180s), `_RESTART_MAX` (4), `_RESTART_WINDOW` (600s). |
| `yui-debug.sh` | Run Yui in background + capture logs for developers. | `start [dev\|prod]`, `start -f`, `stop [--force]`, `restart`, `status`, `logs`, `show [N]`, `list`, `clean [N]`, `help`. Logs in `~/.yuihime/debug/current.log`. |
| `yui-pm2.sh` | Optional PM2 mode (NOT default). | `start [dev\|prod]`, `stop`, `restart`, `status`, `logs [-live] [N]`, `save`, `help`. |
| `yuihime` | Global CLI (symlink to `/usr/local/bin`). All paths resolve relative to itself, so it works from repo or portable bundle. | `daemon ...`, `debug ...`, `watchdog ...`, `pm2 ...`, `start [args...]`, `settings`, `terminal`, `stop\|status\|restart\|logs`, `rebuild`, `install [DIR]`, `install --copy [--prefix DIR]`, `uninstall`, `version`, `help`. |
| `yui-boot.sh` | Boot hook for autostart (systemd / Termux:Boot / UserLAnd / cron @reboot). Location-independent. | `[--pm2\|--no-pm2] [dev\|prod]`, `--resolve` (print project folder). |
| `addon-manager.sh` | Interactive addon install/uninstall via REST API (does NOT touch source). | `bash tools/addon-manager.sh [base_url]` (default `http://localhost:3000`). Uses `GET/POST /api/addons*`. |

## Data / state tools (external features)

| Script | Purpose | Key commands |
|---|---|---|
| `yui-data.sh` | Generic read/write of agent_state (status, mood, emotion, relation, systemHealth) + virtual body. **Best injector for external features.** | `state-read`, `get <jsonPath>`, `set <jsonPath> <value>`, `push <arrayPath> <value>`, `add <jsonPath> <value>`, `sys <systemHealthPath> <value>`, `virtual-body <field>`, `vbody-set <field> <value>`. See `tools/yui-data.md` for the path schema. |
| `yui-status.sh` | Generates `~/.yuihime/user_data/yui_status.md` — one human-readable snapshot of status/vitals/mood/emotion/relation/virtual body. **Agents just read the .md.** | `gen` (write file), `path` (print path), no arg (generate + print). |
| `yui-mood.sh` | Read/set mood & emotion JSON in `agent_state`. | `read`, `set <key> <0-100>`, `set-valence <x>`, `set-arousal <x>`, `preset <happy\|sad\|angry\|love\|calm\|tired\|energetic\|neutral>`, `reset`, `list`. |
| `yui-outfit.sh` | Thin wrapper around the `virtual_body` addon (same write path as daemon). | `read`, `top "<v>"`, `bottom "<v>"`, `underwear "<v>"`, `accessories "<v>"`, `outfit "<top>" "<bottom>" "<underwear>"`, `show`. |
| `yui-virtual-body.sh` | Full edit/inspect of virtual body state via addon. | `read`, `set <field> <value>`, `raw '<json args>'`, `field <field>` (interactive), `edit` ($EDITOR), `menu`. |
| `yui-inventory.sh` | Inspect & inject items into `systemHealth.lifeInventory` (foods/drinks/items). | `read`, `add "<name>" [qty] [emoji]`, `aphro "<name>" [qty] [emoji]` (perangsang), `del "<name>" [qty]`, `food "<name>" [qty]`, `drink "<name>" [qty]`, `reset`. |
| `yui-pool.sh` | Inspect & reset the API key pool cooldown state (`key_pool_state.json`): overloaded, rateLimited, cooldowns, failedModels, failedProviders. | `show`, `reset` (all), `reset <section>`, `reset --restart` (also restart daemon). NOTE: in-memory failure maps hydrate at boot, so a full reset needs a daemon restart. |

## Python utilities

| Script | Purpose |
|---|---|---|
| `update_log.py` | Prepend an entry to `UPDATE_LOG.md` + bump version. Args: `--type`, `--title`, `--bullet` (repeatable), `--version`, `--date`, `--module`. |
| `push_gh.py` | Update logs + git add/commit/push to GitHub. Full pipeline: runs `update_log.py` → `git add -A` → `git commit` → `git push` (auto-detects current branch + first remote). |
| `db_server.py` | Web CRUD UI for `yuihime.db` (SQL queries). `python3 tools/db_server.py --port 5500`. |
| `demo_server.py` | Minimal demo HTTP server used to test Yui background tasks. |
| `full_scan_db_prepare.py` | Audit: scan repo for all `db.prepare()` calls (DB access points). `--root`, `--ext`. |
| `backfill_usage.py` | Backfill the UTC-anchored usage tracker (`logs/usage.YYYY-MM-DD.log`) from historical `llm*.log` audit logs, so daily totals have a baseline. Token counts are unavailable in llm logs, so entries are request-count only (`backfilled:true`, `tokensUnavailable:true`). |

### `backfill_usage.py` usage

```bash
python3 tools/backfill_usage.py --days 7
python3 tools/backfill_usage.py --days 7 --today        # also merge today's llm.log entries
python3 tools/backfill_usage.py --force                 # rebuild files from scratch
python3 tools/backfill_usage.py --providers gemini      # filter by provider
python3 tools/backfill_usage.py --dry-run               # preview without writing
```

* Reads `~/.yuihime/logs/llm.YYYY-MM-DD.log` archives (and `llm.log` for today) and
  reconstructs `usage.YYYY-MM-DD.log` + `usage.YYYY-MM-DD.summary.log`.
* Idempotent: existing entries are skipped (dedup on ts/provider/model/ok/errorType).
* Default skips today so it never collides with the live tracker.

### `push_gh.py` usage

```bash
python3 tools/push_gh.py \
  --type "Fix" \
  --title "Short title" \
  --bullet "- bullet 1" \
  --bullet "- bullet 2" \
  --module "src/modules/agi/LifeSimulationModule.ts — module description"
```

* **Required**: `--title`. Optional: `--type` (default `Fix`), `--bullet` (repeatable), `--version`, `--date`, `--module`, `--branch`, `--remote`.
* **Flags**: `--no-log` (skip UPDATE_LOG.md + version bump, only commit/push), `--dry-run` (print git commands without running them — safe way to preview).
* **What it does** (unless `--no-log`):
  1. Runs `tools/update_log.py` with the same args (prepends UPDATE_LOG entry + bumps minor version).
  2. `git add -A` (stages everything, including new untracked files).
  3. Commits as `[<type>] <title>` with bullets as commit body.
  4. Pushes to the current branch on the first remote (prefers `origin`).
* **Caution**: runs `git add -A`, so it stages ALL changes in the repo. Only run when you intend to commit everything.

## Notes

- **Test files** live in `tools/tester/` (standalone, run with `tsx`, no test framework configured).
- **Bundling**: `npm run build:server` (esbuild) never bundles `tools/`. `npm run build:bin` copies ONLY `yui-daemon.sh`, `yui-debug.sh`, `yui-watchdog.sh`, `yui-pm2.sh`, `yuihime` into `dist/tools/`. The data/state tools are for external features running from the source repo.
