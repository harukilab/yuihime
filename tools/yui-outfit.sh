#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Outfit — quick set & inspect Yui's outfit (top/bottom/underwear/accessories)
#
#  Thin wrapper around the virtual_body addon (same one the daemon uses), so the
#  write path, validation, and requested_by logic stay identical.
#
#  Usage:
#    tools/yui-outfit.sh                    INTERACTIVE MENU
#    tools/yui-outfit.sh read               Show current outfit as the LLM reads it
#    tools/yui-outfit.sh top "<value>"      Set the top / upper garment
#    tools/yui-outfit.sh bottom "<value>"   Set the bottom / skirt / pants
#    tools/yui-outfit.sh underwear "<v>"    Set underwear / panties / bra
#    tools/yui-outfit.sh accessories "<v>"  Set worn accessories
#    tools/yui-outfit.sh outfit "<top>" "<bottom>" "<underwear>"   Set all three at once
#    tools/yui-outfit.sh show               Pretty-print the whole virtual body state
#
#  Example:
#    tools/yui-outfit.sh top "soft white knit top with short sleeves"
#    tools/yui-outfit.sh bottom "navy blue pleated skirt"
#    tools/yui-outfit.sh outfit "pink blouse" "white shorts" "lace bralette"
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

export YUIHIME_USER_DATA_PATH="$ROOT/user_data"

run_addon() {
  node "$ENTRY" "$1"
}

cmd_set() {
  local field="$1" value="$2"
  if [ -z "$field" ] || [ -z "$value" ]; then
    echo "Usage: $0 $field \"<value>\"" >&2
    exit 1
  fi
  echo "Setting $field = '$value'..."
  run_addon "$(python3 -c "import json,sys; print(json.dumps({'action':'set','field':sys.argv[1],'value':sys.argv[2]}))" "$field" "$value")"
  echo ""
}

cmd_read() {
  echo "=== Outfit — what the LLM reads (action=read) ==="
  run_addon '{"action":"read"}'
  echo ""
}

cmd_show() {
  if [ -f "$STATE_FILE" ]; then
    echo "=== Pretty preview ==="
    python3 -m json.tool "$STATE_FILE"
  else
    echo "ERROR: state file not found: $STATE_FILE" >&2
    exit 1
  fi
}

cmd_outfit() {
  local top="$1" bottom="$2" underwear="$3"
  if [ -z "$top" ] || [ -z "$bottom" ] || [ -z "$underwear" ]; then
    echo "Usage: $0 outfit \"<top>\" \"<bottom>\" \"<underwear>\"" >&2
    exit 1
  fi
  echo "Setting top = '$top'"
  cmd_set top "$top"
  echo "Setting bottom = '$bottom'"
  cmd_set bottom "$bottom"
  echo "Setting underwear = '$underwear'"
  cmd_set underwear "$underwear"
}

cmd_menu() {
  while true; do
    echo ""
    echo "=== YuiHime Outfit Menu ==="
    echo "  1) Read outfit (what the LLM sees)"
    echo "  2) Set top"
    echo "  3) Set bottom"
    echo "  4) Set underwear"
    echo "  5) Set accessories"
    echo "  6) Pretty-print full state"
    echo "  0) Exit"
    printf "Choice: "
    read -r choice
    case "$choice" in
      1) cmd_read ;;
      2)
        printf "Top: "; read -r v
        cmd_set top "$v"
        ;;
      3)
        printf "Bottom: "; read -r v
        cmd_set bottom "$v"
        ;;
      4)
        printf "Underwear: "; read -r v
        cmd_set underwear "$v"
        ;;
      5)
        printf "Accessories: "; read -r v
        cmd_set accessories "$v"
        ;;
      6) cmd_show ;;
      0) echo "Bye."; exit 0 ;;
      *) echo "Invalid choice." ;;
    esac
  done
}

case "${1:-}" in
  "")          cmd_menu ;;
  read)        cmd_read ;;
  show)        cmd_show ;;
  top)         cmd_set top "$2" ;;
  bottom)      cmd_set bottom "$2" ;;
  underwear)   cmd_set underwear "$2" ;;
  accessories) cmd_set accessories "$2" ;;
  outfit)      cmd_outfit "$2" "$3" "$4" ;;
  *)
    echo "Usage: $0 [read|show|top \"<v>\"|bottom \"<v>\"|underwear \"<v>\"|accessories \"<v>\"|outfit \"<top>\" \"<bottom>\" \"<underwear>\"]" >&2
    exit 1
    ;;
esac
