# YuiHime `scripts/` Reference

> Quick reference for every script in `scripts/`. External agents should read this
> file to know what each script does + how to invoke it, without opening the files.

All scripts are bash (except `*.py` under `tools/`). Env: `YUIHIME_SYSTEM_ROOT`
(default `$HOME/.yuihime`), `YUIHIME_BOOT_DELAY` (default 10s).

## `boot.sh`

**Purpose:** Boot hook that wakes the daemon + watchdog after a device reboot.
Compatible with Termux:Boot (`~/.termux/boot/*.sh`), UserLAnd (login command),
cron `@reboot`, and init.d. Delay `YUIHIME_BOOT_DELAY` (default 10s), logs to
`~/.yuihime/debug/boot.log`.

**Usage:**
```
bash scripts/boot.sh [--pm2|--no-pm2] [dev|prod]
```
- Default (no PM2): `tools/yui-daemon.sh start` → starts daemon AND local watchdog.
- PM2 (`--pm2` / `YUIHIME_PM2=1`): `pm2 resurrect`, ensure app `yuihime` running,
  PM2-aware watchdog probes `/api/health` → `pm2 restart yuihime` on hang.

## `install.sh`

**Purpose:** Installer — prepares dependencies + installs the global `yuihime` command.

- Clone-new: `node_modules` missing → `npm install` (better-sqlite3 native build).
- Already installed: skip; only ensure better-sqlite3 binding is built (`npm rebuild`).

**Usage:**
```
bash scripts/install.sh [-g|--global] [-u|--user] [-c|--copy [--prefix DIR]]
```
- `--global / -g` : symlink to `/usr/local/bin` (root; sudo if needed).
- `--user / -u`   : symlink to `~/.local/bin` + inject PATH into shell rc
  (`~/.bashrc`, `~/.profile`, `~/.zshrc`) — default when not root.
- `--copy / -c`   : full copy install to safe folder, then npm install + build there
  (global → `/opt/yuihime`, user → `~/.local/share/yuihime`).
- `--prefix DIR`  : override the PREFIX.
- Default when root: global; not root: user.

## `restore-pm2.sh`

**Purpose:** Restore the PM2 `yuihime` app after reboot.
`pm2 resurrect` → `pm2 start`/`restart ecosystem.config.cjs` → `pm2 save` → status.

**Usage:**
```
bash scripts/restore-pm2.sh
```

## `setup-pm2.sh`

**Purpose:** One-time PM2 setup: install `pm2` globally if missing, create
`~/.yuihime/data/logs`, build the project, then `pm2 start ecosystem.config.cjs`,
`pm2 save`, `pm2 status`.

**Usage:**
```
bash scripts/setup-pm2.sh
```

## Related

- `ecosystem.config.cjs` (repo root) is the PM2 app definition used by both PM2 scripts.
- Daily ops generally go through `tools/yui-daemon.sh` / `tools/yui-watchdog.sh`
  rather than these scripts. See `tools/README.md`.
