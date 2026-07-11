# TOOLS.md — Local Notes and Specifications

These notes define how tools work in Yuihime's active runtime workspace.

## Built-in & Custom Tools

- **shell_exec** — Execute shell commands
  - Use when: running diagnostic tests, starting development scripts, or executing permitted external utilities.
  - Restrictions: Dotfiles traversing and System directories access is strictly forbidden by sandbox gates.

- **read_file** — Read file contents
  - Use when: inspecting file source, reading logs, or looking up parameters.

- **write_file** — Write file content
  - Use when: appending logs, creating memory structures, or writing code templates.

- **file_manipulate** — Fast, non-destructive file operations
  - Use when: checking files, deleting directories, or moving resources safely.

- **web_search** — Query online knowledge bases
  - Use when: finding real-time information, weather updates, or news topics.

- **manage_cron** — Register background routines and scheduled reminders
  - Use when: setting reminders, periodic heartbeat cycles, or background syncer events.

- **emotion.adjust** — Tune Yuihime's active feeling state vectors (Joy, Valence, Arousal, etc.)
  - Use when: shifting emotional reactions naturally.

---

*This file is yours to evolve. Keep your physical tools aligned with your capabilities.*
