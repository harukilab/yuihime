#!/usr/bin/env python3
"""
YuiHime SOP Documentation Helper.

Prepends a new entry to UPDATE_LOG.md (AGENTS.md §6) and optionally appends
a module description to MODULES.md.

Usage:
  python3 tools/update_log.py \
    --type "Fix" \
    --title "Robust dynamic tool synthesis JSON parsing + fallback" \
    --bullet "Extract JSON from LLM response even with prose/markdown fences (extractSynthesisJson)." \
    --bullet "Fallback config.toml/main.cjs templates when fields missing instead of throwing." \
    --module "src/core/cortex/dynamicToolSynthesizer.ts — Dynamic Tool Synthesizer (autonomous addon synthesis)."

Conventions (from UPDATE_LOG.md):
  ## [version] - YYYY-MM-DD
  ### Type: title
  - bullet
The version is taken from the first existing entry (bumped minor by default).
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPDATE_LOG = ROOT / "UPDATE_LOG.md"
MODULES_MD = ROOT / "MODULES.md"
PACKAGE_JSON = ROOT / "package.json"
SHARED_CONSTANTS = ROOT / "shared" / "constants.ts"
README_MD = ROOT / "README.md"


def current_version() -> str:
    if not UPDATE_LOG.exists():
        return "0.1"
    text = UPDATE_LOG.read_text(encoding="utf-8")
    m = re.search(r"^##\s*\[([\d.]+)\]", text, re.MULTILINE)
    return m.group(1) if m else "0.1"


def bump_minor(version: str) -> str:
    parts = version.split(".")
    if len(parts) >= 2:
        try:
            parts[-1] = str(int(parts[-1]) + 1)
            return ".".join(parts)
        except ValueError:
            pass
    return version


def prepend_update_log(version: str, day: str, etype: str, title: str, bullets: list[str]) -> None:
    if not UPDATE_LOG.exists():
        UPDATE_LOG.write_text("# YuiHime Project Updates Logs\n---\n", encoding="utf-8")

    text = UPDATE_LOG.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)

    # Ensure header + separator exist.
    if not lines or not lines[0].startswith("#"):
        lines.insert(0, "# YuiHime Project Updates Logs\n")
    if len(lines) < 2 or lines[1].strip() != "---":
        lines.insert(1, "---\n")

    # Find insertion point: after the `---` line.
    insert_at = 2
    for i, ln in enumerate(lines[:3]):
        if ln.strip() == "---":
            insert_at = i + 1
            break

    entry = [
        f"\n## [{version}] - {day}\n",
        f"### {etype}: {title}\n",
    ]
    for b in bullets:
        entry.append(f"- {b}\n")
    entry.append("\n")

    lines[insert_at:insert_at] = entry
    UPDATE_LOG.write_text("".join(lines), encoding="utf-8")


def append_module(desc: str) -> None:
    line = f"- `{desc}`\n"
    if not MODULES_MD.exists():
        MODULES_MD.write_text("# YuiHime Modules & Architecture Map\n\n", encoding="utf-8")
        MODULES_MD.write_text(MODULES_MD.read_text(encoding="utf-8") + line, encoding="utf-8")
        return
    with MODULES_MD.open("a", encoding="utf-8") as f:
        f.write(line)


def update_package_json(version: str) -> None:
    if not PACKAGE_JSON.exists():
        return
    text = PACKAGE_JSON.read_text(encoding="utf-8")
    text = re.sub(r'("version"\s*:\s*")[^"]+(")', rf"\g<1>{version}\2", text)
    PACKAGE_JSON.write_text(text, encoding="utf-8")


def update_shared_constants(version: str) -> None:
    if not SHARED_CONSTANTS.exists():
        return
    text = SHARED_CONSTANTS.read_text(encoding="utf-8")
    text = re.sub(r"(export const APP_VERSION = ')[^']+(')", rf"\g<1>{version}\2", text)
    SHARED_CONSTANTS.write_text(text, encoding="utf-8")


def update_readme(version: str) -> None:
    if not README_MD.exists():
        return
    text = README_MD.read_text(encoding="utf-8")
    text = re.sub(r"(# 👑 Yuihime AI v)[\d.]+( - Autonomous VTuber Engine)", rf"\g<1>{version}\2", text)
    README_MD.write_text(text, encoding="utf-8")


def main() -> int:
    p = argparse.ArgumentParser(description="YuiHime SOP doc helper")
    p.add_argument("--type", default="Fix", help="Entry type, e.g. Fix/Refactor/Feature")
    p.add_argument("--title", required=True, help="Short entry title")
    p.add_argument("--bullet", action="append", default=[], help="Bullet line (repeatable)")
    p.add_argument("--version", help="Override version (default: bump minor of latest)")
    p.add_argument("--date", help="Override date YYYY-MM-DD (default: today)")
    p.add_argument("--module", help="Optional module description to append to MODULES.md")
    args = p.parse_args()

    version = args.version or bump_minor(current_version())
    day = args.date or date.today().isoformat()

    prepend_update_log(version, day, args.type, args.title, args.bullet)
    if args.module:
        append_module(args.module)
    update_package_json(version)
    update_shared_constants(version)
    update_readme(version)

    print(f"OK: UPDATE_LOG.md updated at version [{version}] - {day}")
    if args.module:
        print("OK: MODULES.md appended.")
    print(f"OK: package.json updated to {version}")
    print(f"OK: shared/constants.ts updated to {version}")
    print(f"OK: README.md updated to {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
