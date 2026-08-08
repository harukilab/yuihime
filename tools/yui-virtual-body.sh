#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Virtual Body — edit & inspect Yui's virtual body state
#
#  Invokes the virtual_body addon exactly like the daemon does, and prints the
#  same JSON the LLM reads back to the agent (action=read => current state).
#
#  Usage:
#    tools/yui-virtual-body.sh                      INTERACTIVE MENU (read/edit/set)
#    tools/yui-virtual-body.sh read                 Show state as the LLM sees it
#    tools/yui-virtual-body.sh set <field> <value>  Update ONE field
#    tools/yui-virtual-body.sh raw '<json args>'    Run raw addon args
#    tools/yui-virtual-body.sh field <field>        INTERACTIVE: show current value, edit in place (pre-filled)
#    tools/yui-virtual-body.sh edit                 INTERACTIVE: open state in $EDITOR (nano default), edit, save
#    tools/yui-virtual-body.sh menu                 Force the interactive menu
#
#  Example:
#    tools/yui-virtual-body.sh set top "pink blouse"
#    tools/yui-virtual-body.sh set requested_by yui
#    tools/yui-virtual-body.sh raw '{"action":"set","field":"note","value":"hi","confirmed":true}'
#
#  Env:
#    YUIHIME_SYSTEM_ROOT   Data root (default $HOME/.yuihime)
# ==============================================================================

ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
ADDON_DIR="$ROOT/addons/virtual_body"
ENTRY="$ADDON_DIR/main.js"
STATE_FILE="$ROOT/user_data/virtual_body.json"

if [ ! -f "$ENTRY" ]; then
  echo "ERROR: virtual_body addon not found at $ENTRY" >&2
  exit 1
fi

# The addon resolves YUIHIME_USER_DATA_PATH from env first.
export YUIHIME_USER_DATA_PATH="$ROOT/user_data"

run_addon() {
  local args_json="$1"
  node "$ENTRY" "$args_json"
}

show_state() {
  echo "=== Virtual Body — what the LLM reads (action=read) ==="
  run_addon '{"action":"read"}'
  echo ""
}

cmd_read() {
  show_state
  if [ -f "$STATE_FILE" ]; then
    echo "=== Pretty preview ==="
    python3 -m json.tool "$STATE_FILE"
  fi
}

cmd_set() {
  local field="$1" value="$2"
  if [ -z "$field" ] || [ -z "$value" ]; then
    echo "Usage: $0 set <field> <value>" >&2
    exit 1
  fi
  echo "Setting field='$field' value='$value'..."
  run_addon "$(python3 -c "import json,sys; print(json.dumps({'action':'set','field':sys.argv[1],'value':sys.argv[2]}))" "$field" "$value")"
  echo ""
  echo "=== Result the LLM will read next time ==="
  show_state
}

# Interactive edit of ONE field: pick by number, shows the current value first,
# then lets you edit it in place (pre-filled) — add/remove words freely.
cmd_edit_field() {
  local field="$1"
  local FIELDS=(
    top bottom underwear toys used accessories
    pussy_insert anal_insert nipples clit pose location note requested_by
  )
  if [ -z "$field" ]; then
    echo "Select field by number:"
    for i in "${!FIELDS[@]}"; do
      printf "  %d) %s\n" "$((i + 1))" "${FIELDS[$i]}"
    done
    printf "Field number (0 = cancel): "; read -r num
    [ -z "$num" ] && return 1
    if [ "$num" = "0" ]; then
      return 1
    fi
    if ! [[ "$num" =~ ^[0-9]+$ ]] || [ "$num" -lt 1 ] || [ "$num" -gt "${#FIELDS[@]}" ]; then
      echo "Invalid number."
      return 1
    fi
    field="${FIELDS[$((num - 1))]}"
  fi

  local current
  current="$(python3 -c "
import json,sys
s=json.load(open('$STATE_FILE'))
print(s.get(sys.argv[1], ''))
" "$field")"

  echo "--- Current '$field': ---"
  echo "$current"
  echo "-------------------------"
  printf "New value (edit freely, empty = keep): "
  read -r -e -i "$current" value
  if [ "$value" = "$current" ] && [ -n "$current" ]; then
    echo "Unchanged — skipping."
    return 0
  fi
  if [ -z "$value" ]; then
    echo "Empty — skipping (use set '$field' nothing to clear)."
    return 0
  fi
  cmd_set "$field" "$value"
}

cmd_raw() {
  run_addon "$1"
  echo ""
}

cmd_edit() {
  if [ ! -f "$STATE_FILE" ]; then
    echo "ERROR: state file not found: $STATE_FILE" >&2
    exit 1
  fi
  # Dump pretty JSON to a temp file, open the user's $EDITOR, then validate & save back.
  python3 -c "import json; print(json.dumps(json.load(open('$STATE_FILE')), indent=2, ensure_ascii=False))" > /tmp/yui-vb-edit.json
  ${EDITOR:-nano} /tmp/yui-vb-edit.json
  if python3 -c "import json; json.load(open('/tmp/yui-vb-edit.json'))" 2>/tmp/yui-vb-edit.err; then
    python3 -c "import json; json.dump(json.load(open('/tmp/yui-vb-edit.json')), open('$STATE_FILE','w'), indent=2, ensure_ascii=False)"
    echo "Saved. What the LLM now reads:"
    show_state
  else
    echo "ERROR: invalid JSON — nothing saved." >&2
    cat /tmp/yui-vb-edit.err >&2
    exit 1
  fi
}

cmd_menu() {
  while true; do
    echo ""
    echo "=== YuiHime Virtual Body Menu ==="
    echo "  1) Read state (what the LLM sees)"
    echo "  2) Edit manually  (open $EDITOR — nano default)"
    echo "  3) Set one field  (top/bottom/underwear/pussy_insert/anal_insert/pose/location/requested_by/...)"
    echo "  4) Set requested_by = yui  (current wear is Yui's own initiative)"
    echo "  5) Set requested_by = user (user ordered the current wear)"
    echo "  0) Exit"
    printf "Choice: "
    read -r choice
    case "$choice" in
      1) cmd_read ;;
      2) cmd_edit ;;
      3)
        cmd_edit_field
        ;;
      4) cmd_set requested_by yui ;;
      5) cmd_set requested_by user ;;
      0) echo "Bye."; exit 0 ;;
      *) echo "Invalid choice." ;;
    esac
  done
}

case "${1:-}" in
  "")          cmd_menu ;;
  read)        cmd_read ;;
  set)         cmd_set "$2" "$3" ;;
  raw)         cmd_raw "$2" ;;
  edit)        cmd_edit ;;
  field)       cmd_edit_field "$2" ;;
  menu)        cmd_menu ;;
  *)
    echo "Usage: $0 [read|set <field> <value>|field <field>|raw '<json>'|edit|menu]" >&2
    exit 1
    ;;
esac
