#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Addon Manager — interactive install/uninstall via REST API
#
#  External utility. Does NOT touch YuiHime source code; talks only to the
#  running daemon endpoints:
#    GET    /api/addons
#    POST   /api/addons/install
#    POST   /api/addons/execute/:id
#    DELETE /api/addons/:id
#
#  Usage:  bash tools/addon-manager.sh [base_url]     (default: http://localhost:3000)
# ==============================================================================

BASE_URL="${1:-http://localhost:3000}"
API="$BASE_URL/api/addons"
JQ_AVAILABLE=0
command -v jq >/dev/null 2>&1 && JQ_AVAILABLE=1

# ---- JSON helpers (python3 is guaranteed on the project) --------------------
json_encode() { python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"; }

api_get() {
  curl -sf -X GET "$API" 2>/dev/null
}

api_install() {
  local body="$1"
  curl -sf -X POST "$API/install" -H 'Content-Type: application/json' -d "$body" 2>/dev/null
}

api_uninstall() {
  local id="$1"
  curl -sf -X DELETE "$API/$id" 2>/dev/null
}

api_execute() {
  local id="$1" body="$2"
  curl -sf -X POST "$API/execute/$id" -H 'Content-Type: application/json' -d "$body" 2>/dev/null
}

# ---- Display helpers --------------------------------------------------------
print_addons() {
  local data
  data="$(api_get)" || { echo "ERROR: tidak bisa hubungi $API (daemon jalan?)"; return 1; }
  echo "== Daftar Addon & Skill ($(echo "$data" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))") item) =="
  echo "$data" | python3 -c "
import sys, json
for i, a in enumerate(sorted(json.load(sys.stdin), key=lambda x: x.get('id', '')), 1):
    runtime = a.get('runtime', '-')
    ep = a.get('entryPoint', a.get('entry_point', '-'))
    kind = 'SKILL' if runtime == 'skill' else 'addon'
    print(f'  [{i:>2}] {kind:>5} {a[\"id\"]:<28} runtime={runtime:<7} entry={ep}')
"
}

# Select an addon/skill by list number OR by id.
# Sets global $SEL_ID and $SEL_RUNTIME.
pick_addon() {
  local list
  list="$(api_get)" || { echo "ERROR: tidak bisa hubungi $API (daemon jalan?)"; return 1; }
  local tmpfile="/tmp/yui_addons_$$.json"
  echo "$list" > "$tmpfile"

  echo "== Pilih addon/skill (ketik NOMOR urut atau ID) =="
  python3 - "$tmpfile" <<'PYEOF'
import sys, json
data = sorted(json.load(open(sys.argv[1])), key=lambda a: a.get('id', ''))
for i, a in enumerate(data, 1):
    runtime = a.get('runtime', '-')
    kind = 'SKILL' if runtime == 'skill' else 'addon'
    print(f"  [{i:>2}] {a['id']:<28} {kind} (runtime={runtime})")
PYEOF

  echo -n "Pilihan [nomor/ID] (B = kembali ke menu utama): "
  read -r SEL
  if [ -z "$SEL" ] || [[ "$SEL" =~ ^[bB]$ ]]; then
    rm -f "$tmpfile"; return 1
  fi

  if [[ "$SEL" =~ ^[0-9]+$ ]]; then
    SEL_ID="$(python3 - "$tmpfile" "$SEL" <<'PYEOF'
import sys, json
data = sorted(json.load(open(sys.argv[1])), key=lambda a: a.get('id', ''))
try:
    print(data[int(sys.argv[2]) - 1]['id'])
except Exception:
    pass
PYEOF
)"
    SEL_RUNTIME="$(python3 - "$tmpfile" "$SEL" <<'PYEOF'
import sys, json
data = sorted(json.load(open(sys.argv[1])), key=lambda a: a.get('id', ''))
try:
    print(data[int(sys.argv[2]) - 1].get('runtime', ''))
except Exception:
    pass
PYEOF
)"
    if [ -z "$SEL_ID" ]; then
      echo "Nomor tidak valid."
      rm -f "$tmpfile"; return 1
    fi
  else
    SEL_ID="$SEL"
    SEL_RUNTIME="$(python3 - "$tmpfile" <<PYEOF
import sys, json
data = sorted(json.load(open("$tmpfile")), key=lambda a: a.get('id', ''))
print(next((a.get('runtime','') for a in data if a['id'] == "$SEL"), ''))
PYEOF
)"
  fi
  rm -f "$tmpfile"
  echo "Dipilih: $SEL_ID (runtime=$SEL_RUNTIME)"
}

# ---- Install: from git repo (SKILL.md / config.toml auto-detect) -----------
install_from_repo() {
  while true; do
    echo
    echo "--- Install dari repo git (dukung Claude Skills SKILL.md / config.toml) ---"
    echo "    (URL kosong atau 'B' = kembali ke menu utama)"
    echo -n "URL repo git (mis. https://github.com/Tensor-Art/tensorart-skills): "
    read -r REPO_URL
    [[ "$REPO_URL" =~ ^[bB]$ ]] || [ -n "$REPO_URL" ] || { echo "Batal."; return; }
    [[ "$REPO_URL" =~ ^[bB]$ ]] && { echo "Batal."; return; }

    echo -n "Nama folder skill dalam repo (opsional, Enter utk auto-detect): "
    read -r SKILL_FOLDER
    [[ "$SKILL_FOLDER" =~ ^[bB]$ ]] && { echo "Batal."; return; }
    echo -n "ID target (opsional, Enter utk pakai nama skill): "
    read -r TARGET_ID
    [[ "$TARGET_ID" =~ ^[bB]$ ]] && { echo "Batal."; return; }

    local body
    body="$(python3 - "$REPO_URL" "$SKILL_FOLDER" "$TARGET_ID" <<'PYEOF'
import json, sys
repo = sys.argv[1]; skill = sys.argv[2].strip(); tid = sys.argv[3].strip()
payload = {"repoUrl": repo}
if skill: payload["skill"] = skill
if tid:   payload["id"] = tid
print(json.dumps(payload))
PYEOF
)"
    echo "Menginstall ..."
    local resp
    resp="$(api_install "$body")"
    if [ -n "$resp" ]; then
      echo "$resp" | python3 -m json.tool --no-ensure-ascii 2>/dev/null || echo "$resp"
    else
      echo "ERROR: install gagal (cek URL, koneksi, atau server log)."
    fi
    echo
    echo -n "Install repo lagi? (Enter=ya, B=kembali ke menu utama): "
    read -r AGAIN
    [[ "$AGAIN" =~ ^[bB]$ ]] && return
  done
}

# ---- Install: raw addon (id + runtime + config.toml + entry script) ---------
install_raw() {
  while true; do
    echo
    echo "--- Install addon manual (id + runtime + config.toml + kode) ---"
    echo "    (ID kosong atau 'B' = kembali ke menu utama)"
    echo -n "ID addon (huruf/angka/_/-): "
    read -r ID
    [[ "$ID" =~ ^[bB]$ ]] && { echo "Batal."; return; }
    [[ "$ID" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "ID tidak valid."; return; }

    echo "Runtime: [1] node  [2] python  [3] bash"
    echo -n "Pilih (1/2/3): "
    read -r RT
    case "$RT" in
      1) RUNTIME="node";   EXT="js";;
      2) RUNTIME="python"; EXT="py";;
      3) RUNTIME="bash";   EXT="sh";;
      *) echo "Batal."; return;;
    esac

    echo -n "Nama tampilan (opsional, Enter utk '$ID'): "
    read -r NAME
    [[ "$NAME" =~ ^[bB]$ ]] && { echo "Batal."; return; }
    NAME="${NAME:-$ID}"
    echo -n "Deskripsi singkat: "
    read -r DESC
    [[ "$DESC" =~ ^[bB]$ ]] && { echo "Batal."; return; }
    echo -n "Parameter JSON opsional (utk skema tool, mis. {\"type\":\"object\",\"properties\":{}}): "
    read -r PARAMS
    [[ "$PARAMS" =~ ^[bB]$ ]] && { echo "Batal."; return; }
    PARAMS="${PARAMS:-{\"type\":\"object\",\"properties\":{}}}"

    echo "--- Edit kode entry point (Ctrl-D untuk selesai) ---"
    echo "#!/usr/bin/env $RUNTIME" > /tmp/yui_addon_tmp_$ID.$EXT
    cat >> /tmp/yui_addon_tmp_$ID.$EXT
    CODE="$(cat /tmp/yui_addon_tmp_$ID.$EXT)"
    rm -f /tmp/yui_addon_tmp_$ID.$EXT

    local body
    body="$(python3 - "$ID" "$NAME" "$DESC" "$RUNTIME" "$PARAMS" "$CODE" <<'PYEOF'
import json, sys
_id, name, desc, runtime, params, code = sys.argv[1:7]
config = f'''id = "{_id}"
name = "{name}"
description = "{desc}"
version = "1.0.0"
runtime = "{runtime}"
entry_point = "{("main." + ("py" if runtime=="python" else "sh" if runtime=="bash" else "js"))}"

[tool]
name = "{name}"
description = "{desc}"
parameters = {params}
'''
print(json.dumps({"id": _id, "config": config, "code": code, "runtime": runtime}))
PYEOF
)"

    echo "Menginstall ..."
    local resp
    resp="$(api_install "$body")"
    if [ -n "$resp" ]; then
      echo "$resp" | python3 -m json.tool --no-ensure-ascii 2>/dev/null || echo "$resp"
    else
      echo "ERROR: install gagal (cek server log)."
    fi
    echo
    echo -n "Install addon lagi? (Enter=ya, B=kembali ke menu utama): "
    read -r AGAIN
    [[ "$AGAIN" =~ ^[bB]$ ]] && return
  done
}

# ---- Uninstall --------------------------------------------------------------
uninstall() {
  while true; do
    echo
    echo "--- Uninstall addon/skill (B = kembali ke menu utama) ---"
    pick_addon || { echo "Batal."; return; }
    echo -n "Yakin hapus '$SEL_ID'? (y/N): "
    read -r CONFIRM
    if [[ "$CONFIRM" =~ ^[yY]$ ]]; then
      local resp
      resp="$(api_uninstall "$SEL_ID")"
      if [ -n "$resp" ]; then
        echo "$resp" | python3 -m json.tool --no-ensure-ascii 2>/dev/null || echo "$resp"
      else
        echo "ERROR: gagal menghapus '$SEL_ID'."
      fi
    else
      echo "Batal (tidak dihapus)."
    fi
    echo
    echo -n "Uninstall lagi? (Enter=ya, B=kembali ke menu utama): "
    read -r AGAIN
    [[ "$AGAIN" =~ ^[bB]$ ]] && return
  done
}

# ---- Execute (bonus: jalankan addon/skill) ---------------------------------
execute() {
  while true; do
    echo
    echo "--- Jalankan addon/skill (B = kembali ke menu utama) ---"
    pick_addon || { echo "Batal."; return; }

    local kind="$SEL_RUNTIME"
    if [ "$kind" = "skill" ]; then
      echo "Skill — pilih aksi:"
      echo "  [1] instructions  (baca SKILL.md)"
      echo "  [2] run_script    (jalankan scripts/<file>)"
      echo -n "Pilih (1/2): "
      read -r ACT
      case "$ACT" in
        1) api_execute "$SEL_ID" '{"args":{"action":"instructions"}}' | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('content', json.dumps(d)))
except Exception: print(sys.stdin.read())";;
        2)
          echo -n "Nama script (mis. list_tools.py): "
          read -r SCRIPT
          echo -n "Argumen (spasi-pisah, opsional): "
          read -r SCRIPT_ARGS
          local body
          body="$(python3 - "$SEL_ID" "$SCRIPT" "$SCRIPT_ARGS" <<'PYEOF'
import json, sys
payload = {"args": {"action": "run_script", "script": sys.argv[2]}}
if sys.argv[3].strip():
    payload["args"]["args"] = sys.argv[3].split()
print(json.dumps(payload))
PYEOF
)"
          api_execute "$SEL_ID" "$body" | python3 -m json.tool --no-ensure-ascii 2>/dev/null;;
        *) echo "Batal.";;
      esac
    else
      echo -n "Argumen JSON (opsional, Enter utk kosong): "
      read -r RAW_ARGS
      [[ "$RAW_ARGS" =~ ^[bB]$ ]] && { echo "Batal."; return; }
      RAW_ARGS="${RAW_ARGS:-{}}"
      api_execute "$SEL_ID" "{\"args\":$RAW_ARGS}" | python3 -m json.tool --no-ensure-ascii 2>/dev/null
    fi
    echo
    echo -n "Jalankan lagi? (Enter=ya, B=kembali ke menu utama): "
    read -r AGAIN
    [[ "$AGAIN" =~ ^[bB]$ ]] && return
  done
}

# ---- List (loop untuk refresh) ----------------------------------------------
list_addons() {
  while true; do
    echo
    print_addons || return
    echo
    echo -n "Refresh list? (Enter=ya, B=kembali ke menu utama): "
    read -r AGAIN
    [[ "$AGAIN" =~ ^[bB]$ ]] && return
  done
}

# ---- Main menu --------------------------------------------------------------
main_menu() {
  echo
  echo "======================================================"
  echo "  YuiHime Addon Manager  (API: $API)"
  echo "======================================================"
  echo "  1) List addon & skill"
  echo "  2) Install dari repo git (SKILL.md / config.toml)"
  echo "  3) Install addon manual (id + config + kode)"
  echo "  4) Uninstall"
  echo "  5) Jalankan addon/skill"
  echo "  6) Keluar"
  echo -n "Pilih [1-6]: "
  read -r CHOICE
  case "$CHOICE" in
    1) list_addons;;
    2) install_from_repo;;
    3) install_raw;;
    4) uninstall;;
    5) execute;;
    *) echo "Keluar."; return 1;;
  esac
}

while true; do
  main_menu || break
done
