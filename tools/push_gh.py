#!/usr/bin/env python3
"""
YuiHime GitHub Push Helper.

Updates version, logs, commits changes, and pushes to GitHub.
This runs update_log.py automatically and then performs git staging, committing, and pushing.

Usage:
  python3 tools/push_gh.py \
    --type "Fix" \
    --title "Robust dynamic tool synthesis JSON parsing + fallback" \
    --bullet "Extract JSON from LLM response even with prose/markdown fences (extractSynthesisJson)." \
    --bullet "Fallback config.toml/main.cjs templates when fields missing instead of throwing." \
    --module "src/core/cortex/dynamicToolSynthesizer.ts — Dynamic Tool Synthesizer"
"""

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPDATE_LOG_PY = ROOT / "tools" / "update_log.py"


def run_cmd(args: list[str], dry_run: bool = False) -> str:
    print(f"Running: {' '.join(args)}")
    if dry_run:
        return ""
    res = subprocess.run(args, capture_output=True, text=True, cwd=str(ROOT))
    if res.returncode != 0:
        print(f"Error running command: {' '.join(args)}", file=sys.stderr)
        print(res.stderr, file=sys.stderr)
        sys.exit(res.returncode)
    return res.stdout.strip()


def get_current_branch() -> str:
    try:
        res = subprocess.run(
            ["git", "branch", "--show-current"],
            capture_output=True,
            text=True,
            cwd=str(ROOT),
            check=True
        )
        branch = res.stdout.strip()
        return branch if branch else "main"
    except Exception:
        return "main"


def get_default_remote() -> str:
    """Return the first configured remote, falling back to 'origin'."""
    try:
        res = subprocess.run(
            ["git", "remote"],
            capture_output=True,
            text=True,
            cwd=str(ROOT),
            check=True
        )
        remotes = [r.strip() for r in res.stdout.strip().splitlines() if r.strip()]
        if not remotes:
            return "origin"
        # Prefer 'origin' if it exists, otherwise use the first available remote
        return "origin" if "origin" in remotes else remotes[0]
    except Exception:
        return "origin"


def main() -> int:
    p = argparse.ArgumentParser(description="YuiHime push-to-GitHub helper")
    p.add_argument("--type", default="Fix", help="Entry type, e.g. Fix/Refactor/Feature")
    p.add_argument("--title", required=True, help="Short entry/commit title")
    p.add_argument("--bullet", action="append", default=[], help="Bullet line (repeatable)")
    p.add_argument("--version", help="Override version (default: bump minor of latest)")
    p.add_argument("--date", help="Override date YYYY-MM-DD (default: today)")
    p.add_argument("--module", help="Optional module description to append to MODULES.md")
    p.add_argument("--branch", help="Git branch to push to (default: current branch)")
    p.add_argument("--remote", help="Git remote to push to (default: auto-detected)")
    p.add_argument("--no-log", action="store_true", help="Skip updating UPDATE_LOG.md and related version files")
    p.add_argument("--dry-run", action="store_true", help="Dry run (print git commands without executing them)")
    args = p.parse_args()

    # 1. Run update_log.py if not requested to skip
    if not args.no_log:
        if not UPDATE_LOG_PY.exists():
            print(f"Error: {UPDATE_LOG_PY} not found. Cannot update logs.", file=sys.stderr)
            return 1
        
        log_args = [sys.executable, str(UPDATE_LOG_PY), "--type", args.type, "--title", args.title]
        for b in args.bullet:
            log_args.extend(["--bullet", b])
        if args.version:
            log_args.extend(["--version", args.version])
        if args.date:
            log_args.extend(["--date", args.date])
        if args.module:
            log_args.extend(["--module", args.module])
        
        run_cmd(log_args, dry_run=args.dry_run)

    # 2. Stage changes
    run_cmd(["git", "add", "-A"], dry_run=args.dry_run)

    # 3. Commit
    commit_title = f"[{args.type}] {args.title}"
    commit_body_lines = [f"- {b}" for b in args.bullet]
    if args.module:
        commit_body_lines.append(f"\nModule update: {args.module}")
    
    commit_msg = commit_title
    if commit_body_lines:
        commit_msg += "\n\n" + "\n".join(commit_body_lines)

    run_cmd(["git", "commit", "-m", commit_msg], dry_run=args.dry_run)

    # 4. Push
    target_branch = args.branch or get_current_branch()
    target_remote = args.remote or get_default_remote()
    print(f"Pushing to remote '{target_remote}' branch '{target_branch}'...")
    run_cmd(["git", "push", target_remote, target_branch], dry_run=args.dry_run)

    print("OK: Changes successfully logged, committed, and pushed to GitHub!")
    return 0


if __name__ == "__main__":
    sys.exit(main())
