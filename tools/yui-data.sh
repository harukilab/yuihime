#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Data Injector — generic read/write access to Yui's persisted state
#
#  For external features (e.g. slave mod) to safely modify Yui's runtime data.
#  Reads/writes directly into the SQLite agent_state row and virtual_body.json.
#
#  Usage:
#    tools/yui-data.sh                      INTERACTIVE MENU
#    tools/yui-data.sh state-read           Dump full agent_state row (JSON)
#    tools/yui-data.sh get <jsonPath>       Read a value from agent_state JSON
#    tools/yui-data.sh set <jsonPath> <json>  Set a value (mood.emotion.keys.joy=70)
#    tools/yui-data.sh push <arrayPath> <json>  Append value to an array
#    tools/yui-data.sh add <jsonPath> <json>    Merge object / set value
#    tools/yui-data.sh sys <jsonPath> <json>  Set inside systemHealth JSON
#    tools/yui-data.sh virtual-body <path>    Read virtual_body.json field (dot path)
#    tools/yui-data.sh vbody-set <field> <value>  Set virtual_body.json field (via addon)
#
#  jsonPath is dot-notation into the agent_state row parsed as JSON, e.g.:
#    mood.emotion.keys.joy         → 70
#    systemHealth.lifeVitals.horn  → 40
#    emotion.valence               → -25
#    relation.bond                 → 85
#
#  Examples:
#    tools/yui-data.sh set mood.emotion.keys.joy 70
#    tools/yui-data.sh set relation.bond 85
#    tools/yui-data.sh sys systemHealth.lifeVitals.pee 60
#    tools/yui-data.sh virtual-body underwear
#
#  Env:
#    YUIHIME_SYSTEM_ROOT   Data root (default $HOME/.yuihime)
# ==============================================================================

ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
DB="$ROOT/data/yuihime.db"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VBSET="$ROOT/addons/virtual_body/main.js"

if [ ! -f "$DB" ]; then
  echo "ERROR: database not found at $DB" >&2
  exit 1
fi

js_runner() {
  NODE_PATH="$PROJECT_ROOT/node_modules" node -e "$1"
}

# Generic: run a node snippet with $DB + a state JSON "row" already loaded.
state_run() {
  local js="$1"
  YUIHIME_DB="$DB" js_runner "
    const Database=require('better-sqlite3');
    const db=new Database(process.env.YUIHIME_DB);
    const row=db.prepare('SELECT * FROM agent_state WHERE id=1').get();
    const parsed={};
    for(const [k,v] of Object.entries(row||{})){
      try{parsed[k]=JSON.parse(v);}catch(e){parsed[k]=v;}
    }
    ${js}
  "
}

state_write() {
  local js="$1"
  YUIHIME_DB="$DB" js_runner "
    const Database=require('better-sqlite3');
    const db=new Database(process.env.YUIHIME_DB);
    const row=db.prepare('SELECT * FROM agent_state WHERE id=1').get();
    const parsed={};
    for(const [k,v] of Object.entries(row||{})){
      try{parsed[k]=JSON.parse(v);}catch(e){parsed[k]=v;}
    }
    ${js}
    const out={};
    for(const k of Object.keys(parsed)){
      if(parsed[k]!==null&&typeof parsed[k]==='object'){out[k]=JSON.stringify(parsed[k]);}else{out[k]=parsed[k];}
    }
    const cols=Object.keys(out).join(', ');
    const placeholders=Object.keys(out).map(k=>k+'=@'+k).join(', ');
    const stmt=db.prepare('UPDATE agent_state SET '+placeholders+' WHERE id=1');
    stmt.run(out);
    console.log('OK: agent_state updated');
  "
}

# Resolve dotted path -> object accessor JS code.
path_code() {
  local path="$1" base="$2"
  echo "${base}" | python3 -c "import sys; parts=sys.stdin.read().strip().split('.'); print('.'.join(parts))"
}

cmd_state_read() {
  state_run "
    const dump={};
    for(const k of Object.keys(parsed)){ dump[k]=parsed[k]; }
    console.log(JSON.stringify(dump, null, 2));
  "
}

cmd_get() {
  local path="$1"
  state_run "
    let cur=parsed;
    for(const k of '$path'.split('.')){ if(cur===undefined||cur===null){cur=undefined;break;} cur=cur[k]; }
    console.log(cur===undefined?'<undefined>':(typeof cur==='object'?JSON.stringify(cur):cur));
  "
}

cmd_set() {
  local path="$1" value="$2"
  if [ -z "$path" ] || [ -z "$value" ]; then
    echo "Usage: $0 set <jsonPath> <value>" >&2
    exit 1
  fi
  # parse value: try JSON, else treat as plain string/number
  local parsed_val
  parsed_val="$(python3 -c "import json,sys
s=sys.argv[1]
try: print(json.dumps(json.loads(s)))
except Exception: 
    try: print(json.dumps(int(s)))
    except Exception:
        try: print(json.dumps(float(s)))
        except Exception: print(json.dumps(s))
" "$value")"
  state_write "
    let cur=parsed;
    const parts='$path'.split('.');
    for(let i=0;i<parts.length-1;i++){
      if(cur[parts[i]]===undefined||cur[parts[i]]===null||typeof cur[parts[i]]!=='object'){cur[parts[i]]={};}
      cur=cur[parts[i]];
    }
    cur[parts[parts.length-1]]=JSON.parse(${parsed_val@Q});
  "
}

cmd_push() {
  # push value into an array at jsonPath (creates the array if missing)
  local path="$1" value="$2"
  if [ -z "$path" ] || [ -z "$value" ]; then
    echo "Usage: $0 push <arrayPath> <value>" >&2
    exit 1
  fi
  local parsed_val
  parsed_val="$(python3 -c "import json,sys
s=sys.argv[1]
try: print(json.dumps(json.loads(s)))
except Exception:
    try: print(json.dumps(int(s)))
    except Exception:
        try: print(json.dumps(float(s)))
        except Exception: print(json.dumps(s))
" "$value")"
  state_write "
    let cur=parsed;
    const parts='$path'.split('.');
    for(let i=0;i<parts.length-1;i++){
      if(cur[parts[i]]===undefined||cur[parts[i]]===null||typeof cur[parts[i]]!=='object'){cur[parts[i]]={};}
      cur=cur[parts[i]];
    }
    const key=parts[parts.length-1];
    if(!Array.isArray(cur[key])){cur[key]=[];}
    cur[key].push(JSON.parse(${parsed_val@Q}));
  "
}

cmd_add() {
  # add/merge: object-merge when value is a JSON object, else set like cmd_set
  local path="$1" value="$2"
  if [ -z "$path" ] || [ -z "$value" ]; then
    echo "Usage: $0 add <jsonPath> <value>" >&2
    exit 1
  fi
  local is_json
  is_json="$(python3 -c "import json,sys
try: json.loads(sys.argv[1]); print('1')
except Exception: print('0')
" "$value")"
  if [ "$is_json" = "1" ]; then
    local parsed_val
    parsed_val="$(python3 -c "import json,sys; print(json.dumps(json.loads(sys.argv[1]), ensure_ascii=False))" "$value")"
    state_write "
      let cur=parsed;
      const parts='$path'.split('.');
      for(let i=0;i<parts.length-1;i++){
        if(cur[parts[i]]===undefined||cur[parts[i]]===null||typeof cur[parts[i]]!=='object'){cur[parts[i]]={};}
        cur=cur[parts[i]];
      }
      const key=parts[parts.length-1];
      const incoming=JSON.parse(${parsed_val@Q});
      if(cur[key]===undefined||cur[key]===null||typeof cur[key]!=='object'||Array.isArray(cur[key])!==Array.isArray(incoming)){
        cur[key]=incoming;
      } else if(Array.isArray(cur[key])){
        if(Array.isArray(incoming)){cur[key]=cur[key].concat(incoming);}else{cur[key].push(incoming);}
      } else {
        Object.assign(cur[key], incoming);
      }
    "
  else
    cmd_set "$path" "$value"
  fi
}

cmd_sys() {
  # path relative to systemHealth: e.g. "lifeVitals.pee 60"
  local path="$1" value="$2"
  if [ -z "$path" ] || [ -z "$value" ]; then
    echo "Usage: $0 sys <pathInSystemHealth> <value>" >&2
    exit 1
  fi
  case "$path" in
    systemHealth.*) cmd_set "$path" "$value" ;;
    *) cmd_set "systemHealth.$path" "$value" ;;
  esac
}

cmd_virtual_body() {
  local field="$1"
  if [ -z "$field" ]; then
    echo "Usage: $0 virtual-body <field>" >&2
    exit 1
  fi
  python3 -c "
import json, os
d=json.load(open(os.path.join('$ROOT', 'user_data', 'virtual_body.json')))
val=d
for k in '$field'.split('.'):
    val=val.get(k, '<missing>')
print(val if isinstance(val,str) else json.dumps(val, ensure_ascii=False))
"
}

cmd_vbody_set() {
  local field="$1" value="$2"
  if [ -z "$field" ] || [ -z "$value" ]; then
    echo "Usage: $0 vbody-set <field> <value>" >&2
    exit 1
  fi
  if [ ! -f "$VBSET" ]; then
    echo "ERROR: virtual_body addon not found at $VBSET" >&2
    exit 1
  fi
  YUIHIME_USER_DATA_PATH="$ROOT/user_data" node "$VBSET" "$(python3 -c "import json,sys; print(json.dumps({'action':'set','field':sys.argv[1],'value':sys.argv[2]}, ensure_ascii=False))" "$field" "$value")"
}

cmd_menu() {
  while true; do
    echo ""
    echo "=== YuiHime Data Injector ==="
    echo "  1) State read (full agent_state)"
    echo "  2) Get value (jsonPath)"
    echo "  3) Set value (jsonPath) e.g. mood.emotion.keys.joy=70"
    echo "  4) Set systemHealth value e.g. lifeVitals.pee=60"
    echo "  5) Read virtual body field"
    echo "  6) Set virtual body field"
    echo "  7) Push value into array (jsonPath)"
    echo "  8) Add/merge object (jsonPath)"
    echo "  0) Exit"
    printf "Choice: "
    read -r choice
    case "$choice" in
      1) cmd_state_read ;;
      2)
        printf "jsonPath: "; read -r p
        cmd_get "$p"
        ;;
      3)
        printf "jsonPath: "; read -r p
        printf "value: "; read -r v
        cmd_set "$p" "$v"
        ;;
      4)
        printf "systemHealth path: "; read -r p
        printf "value: "; read -r v
        cmd_sys "$p" "$v"
        ;;
      5)
        printf "field: "; read -r f
        cmd_virtual_body "$f"
        ;;
      6)
        printf "field: "; read -r f
        printf "value: "; read -r v
        cmd_vbody_set "$f" "$v"
        ;;
      7)
        printf "array jsonPath: "; read -r p
        printf "value: "; read -r v
        cmd_push "$p" "$v"
        ;;
      8)
        printf "jsonPath: "; read -r p
        printf "value (JSON/primitive): "; read -r v
        cmd_add "$p" "$v"
        ;;
      0) echo "Bye."; exit 0 ;;
      *) echo "Invalid choice." ;;
    esac
  done
}

case "${1:-}" in
  "")              cmd_menu ;;
  state-read)      cmd_state_read ;;
  get)             cmd_get "$2" ;;
  set)             cmd_set "$2" "$3" ;;
  push)            cmd_push "$2" "$3" ;;
  add)             cmd_add "$2" "$3" ;;
  sys)             cmd_sys "$2" "$3" ;;
  virtual-body)    cmd_virtual_body "$2" ;;
  vbody-set)       cmd_vbody_set "$2" "$3" ;;
  *)
    echo "Usage: $0 [state-read|get <jsonPath>|set <jsonPath> <value>|push <arrayPath> <value>|add <jsonPath> <value>|sys <systemHealthPath> <value>|virtual-body <field>|vbody-set <field> <value>]" >&2
    exit 1
    ;;
esac
