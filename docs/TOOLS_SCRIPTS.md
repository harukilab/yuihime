# Tools & Scripts Reference

This document maps every script under `tools/` and `scripts/` to what it actually
does in the current codebase (audited against source). It is the companion to
`README.md` (overview), `docs/DEPLOYMENT_INFO.md` (deployment), and
`AGENTS.md` (agent-facing notes).

---

## Summary table

| Script | Category | Purpose |
|--------|----------|---------|
| `tools/yuihime` | CLI | Global `yuihime` command — wraps daemon/debug/watchdog/pm2/install/settings/terminal |
| `tools/yui-daemon.sh` | Daemon | start/stop/restart/status/logs/rebuild/autoboot (twin of Telegram `/daemon`) |
| `tools/yui-watchdog.sh` | Supervisor | Health-probe `/api/health` and auto-restart daemon on hang/crash |
| `tools/yui-debug.sh` | Dev runner | Run daemon in background/foreground + session logs under `~/.yuihime/debug/` |
| `tools/yui-pm2.sh` | PM2 | Manage app `yuihime` under PM2 (optional mode) |
| `tools/yui-boot.sh` | Boot | Location-independent boot launcher (`~/.yuihime/bin/yui-boot.sh` target) |
| `tools/addon-manager.sh` | Utility | Interactive addon install/uninstall/execute via REST API |
| `tools/push_gh.py` | Release | Bump version + UPDATE_LOG + git add/commit/push |
| `tools/update_log.py` | Release | Prepend `UPDATE_LOG.md` entry (+ optional `MODULES.md` append) |
| `tools/db_server.py` | Dev tool | Web CRUD + SQL shell for `yuihime.db` (port 5500) |
| `tools/demo_server.py` | Dev tool | Tiny JSON HTTP server for testing background tasks |
| `tools/full_scan_db_prepare.py` | Dev tool | Scan repo for `db.prepare(...)` call sites (DB access audit) |
| `tools/tester/` | Tests | Standalone tests run with `tsx` (no test framework) |
| `scripts/boot.sh` | Boot | Reboot auto-start hook (Termux:Boot / UserLAnd / cron `@reboot` / init.d) |
| `scripts/install.sh` | Install | Dependency handling + global `yuihime` command (+ `--copy` npm-style install) |
| `scripts/setup-pm2.sh` | PM2 | One-shot: install PM2, build, start `ecosystem.config.cjs`, `pm2 save` |
| `scripts/restore-pm2.sh` | PM2 | `pm2 resurrect` + ensure app running + `pm2 save` |

> `tools/dream.py` was **removed** (it targeted non-existent `POST /api/system/dream`;
> real dream trigger is `POST /api/cortex/dream` via the Dreams tab).

---

## Daemon & Supervision chain

Boot / restart order (non-PM2 default):

```
scripts/boot.sh (or tools/yui-daemon.sh autoboot)
  └─ tools/yui-daemon.sh start          # daemon + watchdog
       └─ tools/yui-watchdog.sh start   # supervisor loop (health probe)
            └─ tools/yui-debug.sh start # runs server.ts in background + logs
```

PM2 path (optional, `--pm2` / `YUIHIME_PM2=1`):

```
scripts/setup-pm2.sh (one-shot setup)
  └─ tools/yui-pm2.sh start             # app 'yuihime' via ecosystem.config.cjs
       └─ tools/yui-watchdog.sh start --pm2   # health probe → `pm2 restart yuihime`
```

Runtime artifacts: `~/.yuihime/debug/current.meta` (pid/mode/port),
`current.log` (yui-debug.sh), `watchdog.pid`, `watchdog.log` (rotated to `.old` >1MB).

---

## `tools/yuihime` — global CLI

Symlinked to `PATH` by `scripts/install.sh` or `yuihime install`. Resolves all
paths relative to its own location, so the source clone / portable bundle can be
moved freely.

```
yuihime daemon [start|stop|restart|status|logs|rebuild|autoboot] [--port N] [--cwd DIR]
yuihime debug [start|stop|status|...]          → tools/yui-debug.sh
yuihime watchdog [start|stop|status|log]       → tools/yui-watchdog.sh
yuihime pm2 [start|stop|restart|status|logs]   → tools/yui-pm2.sh
yuihime start [args...]                        foreground daemon (server.ts)
yuihime settings                               Settings TUI
yuihime terminal|sandbox                       interactive sandbox terminal
yuihime stop|status|restart|logs               shortcuts → tools/yui-daemon.sh
yuihime rebuild                                npm run build (repo only)
yuihime install [--copy] [--prefix DIR]        symlink / npm-style install
yuihime uninstall [--copy] [--prefix DIR]      remove install
yuihime version | help
```

Env: `YUIHIME_BIN_DIR` (default `/usr/local/bin`), `YUIHIME_HOME` (bundle/repo override).

---

## `tools/yui-daemon.sh` — daemon manager

Twin terminal of the Telegram `/daemon` bot command. Default mode is **non-PM2**.

```
tools/yui-daemon.sh start [dev|prod]           daemon + watchdog
tools/yui-daemon.sh stop                       stop daemon
tools/yui-daemon.sh restart [dev|prod]
tools/yui-daemon.sh status                     daemon + watchdog + PM2 status
tools/yui-daemon.sh logs [-live] [N]           live stream | last N lines (default 40)
tools/yui-daemon.sh rebuild                    npm run build (web + server)
tools/yui-daemon.sh autoboot [dev|prod]        install boot hook (systemd|Termux|UserLAnd|cron)
tools/yui-daemon.sh autoboot off               remove boot hook
tools/yui-daemon.sh help
```

PM2 variants: `tools/yui-daemon.sh --pm2 start` or `YUIHIME_PM2=1 tools/yui-daemon.sh start`.

`restart` = stop watchdog → stop daemon → start again (via `tools/yui-watchdog.sh restart`).

---

## `tools/yui-watchdog.sh` — supervisor

Probes `/api/health` every `YUIHIME_WATCHDOG_INTERVAL` (default 10s). A timeout on
the endpoint means the event loop is frozen (native DB stall), so it restarts the
daemon. Anti-crash-loop via `YUIHIME_WATCHDOG_RESTART_MAX` (default 4) inside
`YUIHIME_WATCHDOG_RESTART_WINDOW` (default 600s).

```
tools/yui-watchdog.sh start [dev|prod] [--pm2|--no-pm2] [daemon extra...]
tools/yui-watchdog.sh restart [...]
tools/yui-watchdog.sh stop            # watchdog only; daemon keeps running
tools/yui-watchdog.sh status
tools/yui-watchdog.sh log
```

Env: `YUIHIME_WATCHDOG_INTERVAL` (10), `MAX_TIME` (8s curl), `FAILURES` (2),
`BOOT` (180s), `RESTART_MAX` (4), `RESTART_WINDOW` (600). PM2-aware: watchdog only
probes and calls `pm2 restart yuihime`.

---

## `tools/yui-debug.sh` — debug runner

Runs the daemon in background and captures logs for developers.

```
tools/yui-debug.sh start [dev|prod] [extra args...]   background daemon
tools/yui-debug.sh start -f [dev|prod] [...args]      foreground
tools/yui-debug.sh stop [--force]                     SIGINT graceful, SIGKILL fallback
tools/yui-debug.sh restart [dev|prod] [...args]
tools/yui-debug.sh status                             process status + log tail
tools/yui-debug.sh logs                               tail -f active session
tools/yui-debug.sh show [N]                           last N log lines (default 60)
tools/yui-debug.sh list                               list sessions
tools/yui-debug.sh clean [N]                          prune old sessions, keep N (default 10)
tools/yui-debug.sh help
```

Logs: `~/.yuihime/debug/current.log` (active), `current.meta` (pid/mode/port/cmd),
`~/.yuihime/debug/sessions/` (history). Env: `YUIHIME_DAEMON_PORT` (3000), `YUIHIME_CWD`.

---

## `tools/yui-pm2.sh` — PM2 mode

Used by `yui-daemon.sh --pm2` and the bot `/daemon` when `usePm2=true`.

```
tools/yui-pm2.sh start [dev|prod]    start PM2 app 'yuihime'
tools/yui-pm2.sh stop|restart|status|save|help
tools/yui-pm2.sh logs [-live] [N]    stream | last N (default 40)
```

Mode default: prod if `dist/server.cjs` exists, else dev. Env:
`YUIHIME_SYSTEM_ROOT`, `YUIHIME_DAEMON_PORT`, `YUIHIME_CWD`.

---

## `tools/yui-boot.sh` — location-independent boot launcher

The hook installed by `yuihime daemon autoboot` points at a **copy** in
`~/.yuihime/bin/yui-boot.sh` (not an absolute project path), so autostart keeps
working after the clone moves. Project resolution order:

1. Global `yuihime` command in PATH (`readlink -f`)
2. Marker `~/.yuihime/bin/project-root`
3. Common-location scan (fallback)

```
yui-boot.sh [--pm2|--no-pm2] [dev|prod]
yui-boot.sh --resolve       # print resolved project dir, exit
```

---

## `tools/addon-manager.sh` — interactive addon CLI

External utility; talks only to the running daemon REST API:

```
GET    /api/addons
POST   /api/addons/install
POST   /api/addons/execute/:id
DELETE /api/addons/:id
```

Usage: `bash tools/addon-manager.sh [base_url]` (default `http://localhost:3000`).
Uses `curl` (+ `jq` if present; JSON helpers fall back to `python3`).

---

## Release helpers (`tools/update_log.py`, `tools/push_gh.py`)

### `update_log.py`
Prepend an entry to `UPDATE_LOG.md` (AGENTS.md §6) and optionally append a
module description to `MODULES.md`.

```
python3 tools/update_log.py --type Fix --title "..." \
  --bullet "..." [--bullet "..."] [--module "..."] [--version X.Y] [--date YYYY-MM-DD]
```

Version: bumped minor from the latest entry by default; `package.json`,
`shared/constants.ts`, and `README.md` header are synced automatically.

### `push_gh.py`
Runs `update_log.py` automatically, then stages, commits, and pushes to the
auto-detected remote. `--no-log` skips the UPDATE_LOG step (use for releases that
already wrote their log entry).

```
python3 tools/push_gh.py --type Fix --title "..." --bullet "..." [--no-log]
```

---

## Dev tools (Python)

| Script | Usage | Purpose |
|--------|-------|---------|
| `tools/db_server.py` | `python3 tools/db_server.py --port 5500` | Web CRUD UI + SQL runner for `yuihime.db` (path via `YUIHIME_DB_PATH`, else YuiHime convention) |
| `tools/demo_server.py` | `python3 tools/demo_server.py [--host 127.0.0.1] [--port 9876]` | Minimal JSON HTTP server (returns `{status, message, path, timestamp}`) for testing background-task/webhook flows |
| `tools/full_scan_db_prepare.py` | `python3 tools/full_scan_db_prepare.py [--root .] [--ext .ts]` | Walks the repo (skips `node_modules`/`dist`/`.git`) and lists every `db.prepare(...)` call site |

---

## `tools/tester/` — standalone tests

No test framework is configured. Each test is a standalone script run with `tsx`
(e.g. `npx tsx tools/tester/cognitive_loop_test.ts`). Contents are self-explanatory
per name: cognitive-loop, delegate, recovery, native compaction/Gemini/loop,
prompt assembler, dry boot, tool-direct, stress (`stress_db.cjs`), misc helpers
(`analyze_prompt_tokens.py`, `sync_prompts.sh`, `test_worker*.js`).

---

## `scripts/` — deployment helpers

### `scripts/install.sh`
Handles both fresh-clone (`npm install`, native better-sqlite3 build) and
already-installed (`npm rebuild` if binding missing) scenarios, then wires the
global `yuihime` command via `tools/yuihime`:

- `--global` / `-g` — symlink to `/usr/local/bin` (root)
- `--user` / `-u` — symlink to `~/.local/bin` + idempotent PATH injection into shell rc
- `--copy` / `-c` + `--prefix DIR` — npm-style install: copy source (minus
  `node_modules`/`.git`/`dist`), `npm install` + `npm run build` in place,
  symlink `<target>/tools/yuihime`, write `~/.yuihime/bin/project-root` marker
- `--remove` / `-r` — uninstall (folder + symlink; `~/.yuihime` data kept)
- `--build`, `--no-deps` flags

Env: `YUIHIME_BIN_DIR`, `YUIHIME_HOME`.

### `scripts/boot.sh`
Reboot auto-start hook: `bash scripts/boot.sh [--pm2|--no-pm2] [dev|prod]`.
Default (non-PM2) → `tools/yui-daemon.sh start`. PM2 → `pm2 resurrect`, ensure
app `yuihime` running, PM2-aware watchdog. Delays `YUIHIME_BOOT_DELAY` (default
10s). Logs to `~/.yuihime/debug/boot.log`. Install targets: Termux:Boot,
UserLAnd login command, cron `@reboot`, init.d.

### `scripts/setup-pm2.sh` / `scripts/restore-pm2.sh`
One-shot PM2 bootstrap: ensure PM2 installed, `mkdir -p ~/.yuihime/data/logs`,
`npm run build`, `pm2 start ecosystem.config.cjs` (fallback restart), `pm2 save`.
`restore-pm2.sh` does `pm2 resurrect` + ensure-running + `pm2 save` (for after a
machine reboot when PM2's own startup was not configured).

---

## Maintenance invariants

- **Never hand-edit** `~/.yuihime/data/available_tools.json` — it is generated by
  `src/core/toolRegistryFile.ts`.
- `tools/yui-daemon.sh restart` always goes through the watchdog
  (`tools/yui-watchdog.sh restart`), never a raw kill — this prevents orphaned
  processes and lingering ports.
- PM2 app name is `yuihime` everywhere (`tools/yui-pm2.sh`, `ecosystem.config.cjs`,
  `scripts/setup-pm2.sh`, `scripts/restore-pm2.sh`, watchdog `--pm2`).
- Release flow: `python3 tools/update_log.py ...` → `npm run build` →
  `python3 tools/push_gh.py --title ...` (add `--no-log` if the entry was already written).
