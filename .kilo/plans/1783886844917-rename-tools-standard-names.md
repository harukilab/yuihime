# Plan: Rename Tools to Standard AI-Agent Names

## Context
User wants all Yuihime tools renamed to names commonly used by AI agents. Current ids mix
snake_case and kebab-case and some are misleading (e.g. `file_search` is actually a memory
search; `get_logs`/`get_system_logs` are both "View System Logs"; `manage_files` etc.).

Decisions confirmed with user:
- **Convention:** `snake_case` (OpenAI/standard agent function style: `read_file`, `run_command`).
- **Folders:** KEEP existing `src/drivers/tools/<folder>` names (dispatch is by manifest `id`, not folder; glob/import ignore folder name).

## How tool ids resolve (verify before editing)
- Canonical `id` source = `src/drivers/tools/<folder>/manifest.json` (`"id"` field).
- `src/core/available_tools.json` is **auto-regenerated from manifests at boot** (RegistryInitializer.ts:703-718). Edit it manually for immediate consistency, but a restart will overwrite it.
- Dispatch: `cortexThinkEngine.ts:979` → `SystemRegistry.getTool(tc.name || tc.tool)`.
- Hardcoded references also exist in:
  - `src/core/cortex/cortexThinkEngine.ts` (lines 378, 802, 804, 808, 821, 833, 1023, 1097, 1363, 1368-1379 switch, 1425)
  - `src/share/prompts/build-info.json:84` (TOOLS.md prompt lists several ids)

## Proposed id mapping (snake_case)
Unchanged (already standard): `code_interpreter`, `download_file`, `edit_file`, `calculator`,
`get_current_time`, `github`, `list_files`, `send_message`, `control_overlay`, `read_file`,
`send_file`, `write_file`, `web_search`.

Renamed:
| Current id | New id | New display `name` |
|---|---|---|
| send_final_reply | final_answer | Final Answer |
| send_status_update | status_update | Status Update |
| emotion_adjust | set_emotion | Set Emotion |
| manage_files | file_manager | File Manager |
| file_operations | file_automation | File Automation |
| file_search | search_memory | Search Memory |
| lua_interpreter | run_lua | Run Lua |
| manage_cron | scheduler | Scheduler |
| manage_identities | update_user_profile | Update User Profile |
| manage_pairing | pair_account | Pair Account |
| install_plugin | install_addon | Install Addon |
| python_interpreter | run_python | Run Python |
| search_chat_history | search_chat | Search Chat |
| shell_exec | run_command | Run Command |
| tensorart_generate | generate_image | Generate Image |
| get_logs | view_logs | View Logs |
| get_system_logs | view_system_logs | View System Logs |
| web_scraper | scrape_web | Scrape Web |

(Adjust any target in this table if user prefers different names before implementation.)

## Implementation steps (per renamed tool)
1. Edit `src/drivers/tools/<folder>/manifest.json`: update `"id"` (and `"name"` per table).
   Keep folder name unchanged.
2. Edit `src/core/available_tools.json`: update matching `"id"`/`"name"` entry (will be
   auto-overwritten at next boot, but keep consistent now).
3. Update `src/core/cortex/cortexThinkEngine.ts` references:
   - L378 array: replace `read_file/list_files/get_logs/get_system_logs/manage_files` with new ids.
   - L802, L808, L821, L833, L1097, L1363: `send_final_reply` → `final_answer`; `send_status_update` → `status_update`.
   - L1023 list `['run_command','shell','execute_shell','shell_exec']`: drop `shell_exec`, keep `run_command` (+ legacy aliases `shell`,`execute_shell` if desired).
   - L1368-1379 switch: rename each case label (`read_file`,`write_file`,`list_files`,`web_search`,`shell_exec`,`download_file`,`manage_files`,`emotion_adjust`,`manage_pairing`,`send_message`) to new ids; update Indonesian descriptions accordingly.
   - L1425: `web_search` stays.
4. Edit `src/share/prompts/build-info.json:84` (TOOLS.md): rename listed ids
   (`shell_exec`→`run_command`, `file_operations`→`file_automation`, `manage_cron`→`scheduler`,
   `emotion_adjust`→`set_emotion`, `file_search`→`search_memory`, plus `read_file`/`write_file`/
   `web_search`/`get_current_time`/`calculator` unchanged).
5. Broad grep safety pass: search whole repo (src, src/share, yui_tests) for every OLD id string
   and update any remaining references (tests, prompts, docs-as-code). Exclude node_modules and
   UPDATE_LOG/MODULES docs (historical, not runtime).

## Risks / watch-outs
- `final_answer` and `status_update` are used by the core ReAct loop contract (cortexThinkEngine
  L802-833, L1097, L1363). Renaming them MUST update all those spots or the loop breaks.
- `shell_exec`→`run_command` aligns with an existing alias already present at L1023.
- `get_logs`/`get_system_logs`→`view_logs`/`view_system_logs` also makes ids match their folder names.
- Ensure total registered tool count stays 31 after changes (RegistryInitializer regenerates available_tools.json at boot; verify boot log `[REGISTRY] Successfully saved ...`).

## Validation
- `grep -rEn` for each old id across `src/` and `src/share/` → expect zero runtime matches.
- Restart server; confirm boot log shows 31 tools registered and `available_tools.json` regenerated
  with new ids.
- Smoke test: ask Yui to use a renamed tool (e.g. `run_command`, `file_manager`, `search_memory`)
  and confirm the tool_call `function.name` matches the new id and executes.
- Optionally run `npm run lint` if available.

## Out of scope
- Renaming driver folders (kept per user decision).
- Changing parameter schemas or tool behavior.
- Updating historical changelog docs (UPDATE_LOG/MODULES) — only runtime references.
