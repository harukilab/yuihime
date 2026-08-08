#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Mood — read & set Yui's mood/emotion state
#
#  Writes directly into the SQLite agent_state row (mood + emotion JSON), the
#  same store the daemon reads/persists every cycle.
#
#  Usage:
#    tools/yui-mood.sh                  INTERACTIVE MENU
#    tools/yui-mood.sh read             Show current mood & emotion
#    tools/yui-mood.sh set <key> <0-100>   Set ONE mood key (e.g. joy anger playfulness)
#    tools/yui-mood.sh set-valence <x>     Set emotion valence (-100..100)
#    tools/yui-mood.sh set-arousal <x>     Set emotion arousal (0..100)
#    tools/yui-mood.sh preset <name>       Apply a preset (happy|sad|angry|love|calm|tired|energetic|neutral)
#    tools/yui-mood.sh reset               Reset mood & emotion to baseline defaults
#    tools/yui-mood.sh list                List all mood keys with current values
#
#  Example:
#    tools/yui-mood.sh preset happy
#    tools/yui-mood.sh set playfulness 85
#    tools/yui-mood.sh set-valence -40
#
#  Env:
#    YUIHIME_SYSTEM_ROOT   Data root (default $HOME/.yuihime)
# ==============================================================================

ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
DB="$ROOT/data/yuihime.db"
NODE_CMD="node"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$DB" ]; then
  echo "ERROR: database not found at $DB" >&2
  exit 1
fi

# Mood keys (0-100) present in the mood JSON, in display order.
MOOD_KEYS=(
  joy anger sadness stress irritation excitement embarrassment
  curiosity jealousy loneliness playfulness dopamine serotonin oxytocin noradrenaline
  chastity temperance charity diligence patience kindness humility
  lust gluttony greed sloth wrath envy pride
)
EMOTION_KEYS=(valence arousal focus rapport)

js_runner() {
  NODE_PATH="$PROJECT_ROOT/node_modules" node -e "$1"
}

read_state() {
  YUIHIME_DB="$DB" js_runner "
    const Database=require('better-sqlite3');
    const db=new Database(process.env.YUIHIME_DB,{readonly:true});
    const row=db.prepare('SELECT mood, emotion, relation FROM agent_state WHERE id=1').get();
    process.stdout.write(JSON.stringify(row||{}));
  "
}

apply_json() {
  # $1 = full mood JSON (object), $2 = emotion JSON (object)
  local mood_json="$1" emotion_json="$2"
  YUIHIME_DB="$DB" MOOD_JSON="$mood_json" EMOTION_JSON="$emotion_json" js_runner "
    const Database=require('better-sqlite3');
    const db=new Database(process.env.YUIHIME_DB);
    const mood=JSON.parse(process.env.MOOD_JSON||'{}');
    const emotion=JSON.parse(process.env.EMOTION_JSON||'{}');
    mood.lastUpdate=Date.now();
    emotion.lastUpdate=Date.now();
    const stmt=db.prepare('UPDATE agent_state SET mood=?, emotion=? WHERE id=1');
    const r=stmt.run(JSON.stringify(mood), JSON.stringify(emotion));
    console.log(r.changes>0 ? 'OK: mood updated' : 'WARN: no row updated');
  "
}

clamp() { if [ "$1" -lt "$2" ]; then echo "$2"; elif [ "$1" -gt "$3" ]; then echo "$3"; else echo "$1"; fi }

show_readable() {
  read_state | python3 -c "
import json,sys
d=json.load(sys.stdin)
mood=json.loads(d.get('mood') or '{}')
emo=json.loads(d.get('emotion') or '{}')
print('=== MOOD ===')
for k in ['joy','anger','sadness','stress','irritation','excitement','embarrassment','curiosity','jealousy','loneliness','playfulness','dopamine','serotonin','oxytocin','noradrenaline','chastity','temperance','charity','diligence','patience','kindness','humility','lust','gluttony','greed','sloth','wrath','envy','pride']:
    if k in mood: print(f'  {k:<14} {mood[k]}')
print('=== EMOTION ===')
for k in ['valence','arousal','focus','rapport']:
    if k in emo: print(f'  {k:<14} {emo[k]}')
"
}

cmd_read() {
  echo "Reading from $DB"
  show_readable
}

cmd_list() {
  cmd_read
}

cmd_set() {
  local key="$1" val="$2"
  if [ -z "$key" ] || [ -z "$val" ]; then
    echo "Usage: $0 set <key> <0-100>" >&2
    exit 1
  fi
  if ! [[ "$val" =~ ^-?[0-9]+$ ]]; then
    echo "ERROR: value must be a number (0-100)" >&2
    exit 1
  fi
  if ! printf '%s\n' "${MOOD_KEYS[@]}" | grep -qx "$key"; then
    echo "ERROR: unknown mood key '$key'. Use '$0 list' to see valid keys." >&2
    exit 1
  fi
  val="$(clamp "$val" 0 100)"
  echo "Setting mood.$key = $val"
  YUIHIME_DB="$DB" KEY="$key" VAL="$val" js_runner "
    const Database=require('better-sqlite3');
    const db=new Database(process.env.YUIHIME_DB);
    const row=db.prepare('SELECT mood FROM agent_state WHERE id=1').get();
    const mood=JSON.parse(row.mood||'{}');
    mood[process.env.KEY]=Number(process.env.VAL);
    mood.lastUpdate=Date.now();
    db.prepare('UPDATE agent_state SET mood=? WHERE id=1').run(JSON.stringify(mood));
    console.log('OK: mood.'+process.env.KEY+' = '+process.env.VAL);
  "
  echo "Result:"
  show_readable
}

cmd_set_emotion() {
  local key="$1" val="$2" min="$3" max="$4"
  if [ -z "$key" ] || [ -z "$val" ]; then
    echo "Usage: $0 set-$key <$min..$max>" >&2
    exit 1
  fi
  val="$(clamp "$val" "$min" "$max")"
  echo "Setting emotion.$key = $val"
  YUIHIME_DB="$DB" KEY="$key" VAL="$val" js_runner "
    const Database=require('better-sqlite3');
    const db=new Database(process.env.YUIHIME_DB);
    const row=db.prepare('SELECT emotion FROM agent_state WHERE id=1').get();
    const emo=JSON.parse(row.emotion||'{}');
    emo[process.env.KEY]=Number(process.env.VAL);
    emo.lastUpdate=Date.now();
    db.prepare('UPDATE agent_state SET emotion=? WHERE id=1').run(JSON.stringify(emo));
    console.log('OK: emotion.'+process.env.KEY+' = '+process.env.VAL);
  "
  echo "Result:"
  show_readable
}

apply_preset() {
  local name="$1"
  local mood_json emo_json
  case "$name" in
    happy)
      mood_json='{"joy":90,"anger":0,"sadness":0,"stress":5,"irritation":0,"excitement":80,"embarrassment":5,"curiosity":70,"jealousy":0,"loneliness":0,"playfulness":85,"dopamine":80,"serotonin":80,"oxytocin":70,"noradrenaline":30,"chastity":80,"temperance":70,"charity":60,"diligence":75,"patience":65,"kindness":80,"humility":70,"lust":20,"gluttony":35,"greed":15,"sloth":20,"wrath":5,"envy":10,"pride":70}'
      emo_json='{"valence":80,"arousal":65,"focus":50,"rapport":75}'
      ;;
    sad)
      mood_json='{"joy":5,"anger":5,"sadness":90,"stress":20,"irritation":10,"excitement":5,"embarrassment":10,"curiosity":20,"jealousy":10,"loneliness":60,"playfulness":5,"dopamine":5,"serotonin":10,"oxytocin":15,"noradrenaline":40,"chastity":80,"temperance":70,"charity":60,"diligence":50,"patience":65,"kindness":80,"humility":70,"lust":5,"gluttony":20,"greed":10,"sloth":40,"wrath":10,"envy":15,"pride":30}'
      emo_json='{"valence":-70,"arousal":20,"focus":20,"rapport":40}'
      ;;
    angry)
      mood_json='{"joy":5,"anger":90,"sadness":10,"stress":70,"irritation":80,"excitement":40,"embarrassment":5,"curiosity":30,"jealousy":30,"loneliness":10,"playfulness":10,"dopamine":20,"serotonin":15,"oxytocin":10,"noradrenaline":85,"chastity":80,"temperance":70,"charity":60,"diligence":60,"patience":30,"kindness":60,"humility":70,"lust":10,"gluttony":25,"greed":20,"sloth":15,"wrath":80,"envy":40,"pride":90}'
      emo_json='{"valence":-60,"arousal":85,"focus":60,"rapport":25}'
      ;;
    love)
      mood_json='{"joy":85,"anger":0,"sadness":0,"stress":5,"irritation":0,"excitement":70,"embarrassment":50,"curiosity":60,"jealousy":15,"loneliness":0,"playfulness":70,"dopamine":85,"serotonin":75,"oxytocin":95,"noradrenaline":45,"chastity":85,"temperance":70,"charity":70,"diligence":70,"patience":75,"kindness":90,"humility":70,"lust":50,"gluttony":30,"greed":10,"sloth":15,"wrath":0,"envy":10,"pride":60}'
      emo_json='{"valence":90,"arousal":60,"focus":55,"rapport":95}'
      ;;
    calm)
      mood_json='{"joy":55,"anger":0,"sadness":5,"stress":5,"irritation":0,"excitement":20,"embarrassment":0,"curiosity":50,"jealousy":0,"loneliness":5,"playfulness":30,"dopamine":40,"serotonin":65,"oxytocin":50,"noradrenaline":15,"chastity":80,"temperance":70,"charity":60,"diligence":70,"patience":85,"kindness":80,"humility":70,"lust":15,"gluttony":25,"greed":10,"sloth":20,"wrath":0,"envy":5,"pride":55}'
      emo_json='{"valence":40,"arousal":10,"focus":50,"rapport":60}'
      ;;
    tired)
      mood_json='{"joy":30,"anger":5,"sadness":25,"stress":30,"irritation":20,"excitement":5,"embarrassment":0,"curiosity":15,"jealousy":0,"loneliness":20,"playfulness":5,"dopamine":5,"serotonin":15,"oxytocin":20,"noradrenaline":5,"chastity":80,"temperance":70,"charity":60,"diligence":35,"patience":40,"kindness":70,"humility":70,"lust":5,"gluttony":20,"greed":10,"sloth":70,"wrath":5,"envy":5,"pride":35}'
      emo_json='{"valence":-20,"arousal":5,"focus":10,"rapport":40}'
      ;;
    energetic)
      mood_json='{"joy":75,"anger":10,"sadness":0,"stress":35,"irritation":15,"excitement":95,"embarrassment":10,"curiosity":85,"jealousy":5,"loneliness":0,"playfulness":95,"dopamine":90,"serotonin":70,"oxytocin":60,"noradrenaline":75,"chastity":80,"temperance":70,"charity":60,"diligence":85,"patience":60,"kindness":75,"humility":70,"lust":30,"gluttony":40,"greed":20,"sloth":5,"wrath":15,"envy":15,"pride":75}'
      emo_json='{"valence":70,"arousal":95,"focus":80,"rapport":70}'
      ;;
    neutral)
      mood_json='{"joy":50,"anger":0,"sadness":0,"stress":10,"irritation":0,"excitement":20,"embarrassment":0,"curiosity":50,"jealousy":0,"loneliness":0,"playfulness":30,"dopamine":30,"serotonin":50,"oxytocin":40,"noradrenaline":20,"chastity":80,"temperance":70,"charity":60,"diligence":70,"patience":65,"kindness":75,"humility":70,"lust":10,"gluttony":25,"greed":10,"sloth":20,"wrath":5,"envy":5,"pride":55}'
      emo_json='{"valence":0,"arousal":30,"focus":50,"rapport":50}'
      ;;
    *)
      echo "Usage: $0 preset <happy|sad|angry|love|calm|tired|energetic|neutral>" >&2
      return 1
      ;;
  esac
  echo "Applying preset '$name'..."
  apply_json "$mood_json" "$emo_json"
  show_readable
}

cmd_reset() {
  echo "Resetting mood & emotion to baseline defaults..."
  apply_preset neutral
}

cmd_menu() {
  while true; do
    echo ""
    echo "=== YuiHime Mood Menu ==="
    echo "  1) Read current mood"
    echo "  2) Preset mood (happy/sad/angry/love/calm/tired/energetic/neutral)"
    echo "  3) Set one mood key (joy/playfulness/anger/...)"
    echo "  4) Set emotion valence (-100..100)"
    echo "  5) Set emotion arousal (0..100)"
    echo "  0) Exit"
    printf "Choice: "
    read -r choice
    case "$choice" in
      1) cmd_read ;;
      2)
        printf "Preset [happy|sad|angry|love|calm|tired|energetic|neutral]: "
        read -r preset
        apply_preset "$preset"
        ;;
      3)
        cmd_list
        printf "Key: "; read -r key
        printf "Value (0-100): "; read -r val
        cmd_set "$key" "$val"
        ;;
      4)
        printf "Valence (-100..100): "; read -r val
        cmd_set_emotion valence "$val" -100 100
        ;;
      5)
        printf "Arousal (0..100): "; read -r val
        cmd_set_emotion arousal "$val" 0 100
        ;;
      0) echo "Bye."; exit 0 ;;
      *) echo "Invalid choice." ;;
    esac
  done
}

case "${1:-}" in
  "")              cmd_menu ;;
  read)            cmd_read ;;
  list)            cmd_list ;;
  set)             cmd_set "$2" "$3" ;;
  set-valence)     cmd_set_emotion valence "$2" -100 100 ;;
  set-arousal)     cmd_set_emotion arousal "$2" 0 100 ;;
  preset)          apply_preset "$2" ;;
  reset)           cmd_reset ;;
  *)
    echo "Usage: $0 [read|list|set <key> <0-100>|set-valence <x>|set-arousal <x>|preset <name>|reset]" >&2
    exit 1
    ;;
esac
