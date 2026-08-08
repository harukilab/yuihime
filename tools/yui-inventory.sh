#!/usr/bin/env bash
# ==============================================================================
#  YuiHime Inventory — inspect & inject items into Yui's inventory
#
#  Writes directly into the SQLite agent_state.systemHealth.lifeInventory, the
#  same store LifeSimulationModule reads every cycle.
#
#  Usage:
#    tools/yui-inventory.sh                    INTERACTIVE MENU
#    tools/yui-inventory.sh read               Show full inventory (foods/drinks/items)
#    tools/yui-inventory.sh add "<name>" [qty] [emoji]   Add a custom item (items list)
#    tools/yui-inventory.sh aphro "<name>" [qty] [emoji] Add an APHRODISIAC item (flagged)
#    tools/yui-inventory.sh del "<name>" [qty] Remove/dec item by name (items list)
#    tools/yui-inventory.sh food "<name>" [qty] Add a food item
#    tools/yui-inventory.sh drink "<name>" [qty] Add a drink item
#    tools/yui-inventory.sh reset             Reset inventory to starter defaults
#    tools/yui-inventory.sh set <category> <idx> <qty>  Set qty directly (1-based index)
#
#  Example:
#    tools/yui-inventory.sh add "Buku Sakti" 2 📕
#    tools/yui-inventory.sh aphro "Perangsang" 5 🍬
#    tools/yui-inventory.sh food "Kue Coklat" 3
#
#  Env:
#    YUIHIME_SYSTEM_ROOT   Data root (default $HOME/.yuihime)
# ==============================================================================

ROOT="${YUIHIME_SYSTEM_ROOT:-$HOME/.yuihime}"
DB="$ROOT/data/yuihime.db"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$DB" ]; then
  echo "ERROR: database not found at $DB" >&2
  exit 1
fi

js_runner() {
  NODE_PATH="$PROJECT_ROOT/node_modules" node -e "$1"
}

# $1 = JS expression string; run against the DB with inventory loaded.
inv_txn() {
  local js="$1"
  YUIHIME_DB="$DB" js_runner "
    const Database=require('better-sqlite3');
    const db=new Database(process.env.YUIHIME_DB);
    const row=db.prepare('SELECT systemHealth FROM agent_state WHERE id=1').get();
    const sh=JSON.parse(row.systemHealth||'{}');
    const inv=sh.lifeInventory||{foods:[],drinks:[],items:[]};
    if(!Array.isArray(inv.foods))inv.foods=[];
    if(!Array.isArray(inv.drinks))inv.drinks=[];
    if(!Array.isArray(inv.items))inv.items=[];
    ${js}
    sh.lifeInventory=inv;
    db.prepare('UPDATE agent_state SET systemHealth=? WHERE id=1').run(JSON.stringify(sh));
  "
}

# $1 = JS expression string; read-only.
inv_read() {
  local js="$1"
  YUIHIME_DB="$DB" js_runner "
    const Database=require('better-sqlite3');
    const db=new Database(process.env.YUIHIME_DB,{readonly:true});
    const row=db.prepare('SELECT systemHealth FROM agent_state WHERE id=1').get();
    const sh=JSON.parse(row.systemHealth||'{}');
    const inv=sh.lifeInventory||{foods:[],drinks:[],items:[]};
    ${js}
  "
}

show_inventory() {
  inv_read "
    const fmt=(i)=>{const en=i.en?(' ('+i.en+')'):'';const jp=i.jp?(' / '+i.jp):'';const aph=i.aphrodisiac?' [aphrodisiac]':'';return i.emoji+' '+i.name+en+jp+aph+' x'+i.qty};
    const f=(inv.foods||[]).filter(i=>i.qty>0);
    const d=(inv.drinks||[]).filter(i=>i.qty>0);
    const it=(inv.items||[]).filter(i=>i.qty>0);
    console.log('=== FOODS ('+f.length+') ===');
    f.forEach(i=>console.log('  '+fmt(i)));
    console.log('=== DRINKS ('+d.length+') ===');
    d.forEach(i=>console.log('  '+fmt(i)));
    console.log('=== ITEMS ('+it.length+') ===');
    it.forEach(i=>console.log('  '+fmt(i)));
  "
}

cmd_read() {
  echo "Reading from $DB"
  show_inventory
}

cmd_add() {
  local name="$1" qty="$2" emoji="$3"
  if [ -z "$name" ]; then
    echo "Usage: $0 add \"<name>\" [qty] [emoji]" >&2
    exit 1
  fi
  qty="${qty:-1}"
  emoji="${emoji:-📦}"
  inv_txn "
    const slug=String('$name').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/g,'');
    const existing=inv.items.find(i=>i.custom&&i.id==='item_'+slug);
    if(existing){existing.qty+=${qty};}
    else{inv.items.push({id:'item_'+slug+'$RANDOM',name:'$name',en:'$name',emoji:'$emoji',qty:${qty},custom:true});}
  "
  echo "OK: added '$name' x$qty"
  show_inventory
}

cmd_aphro() {
  local name="$1" qty="$2" emoji="$3"
  if [ -z "$name" ]; then
    echo "Usage: $0 aphro \"<name>\" [qty] [emoji]" >&2
    exit 1
  fi
  qty="${qty:-1}"
  emoji="${emoji:-🍬}"
  inv_txn "
    const slug=String('$name').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/g,'');
    const existing=inv.items.find(i=>i.aphrodisiac&&i.id==='item_'+slug);
    if(existing){existing.qty+=${qty};existing.aphrodisiac=true;}
    else{inv.items.push({id:'item_'+slug+'$RANDOM',name:'$name',en:'$name',emoji:'$emoji',qty:${qty},custom:true,aphrodisiac:true});}
  "
  echo "OK: added APHRODISIAC '$name' x$qty"
  show_inventory
}

cmd_food() {
  local name="$1" qty="$2"
  if [ -z "$name" ]; then
    echo "Usage: $0 food \"<name>\" [qty]" >&2
    exit 1
  fi
  qty="${qty:-1}"
  inv_txn "
    const slug=String('$name').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/g,'');
    const existing=inv.foods.find(i=>i.id===slug);
    if(existing){existing.qty+=${qty};}
    else{inv.foods.push({id:slug,name:'$name',en:'$name',emoji:'🍽️',qty:${qty}});}
  "
  echo "OK: added food '$name' x$qty"
  show_inventory
}

cmd_drink() {
  local name="$1" qty="$2"
  if [ -z "$name" ]; then
    echo "Usage: $0 drink \"<name>\" [qty]" >&2
    exit 1
  fi
  qty="${qty:-1}"
  inv_txn "
    const slug=String('$name').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+\$/g,'');
    const existing=inv.drinks.find(i=>i.id===slug);
    if(existing){existing.qty+=${qty};}
    else{inv.drinks.push({id:slug,name:'$name',en:'$name',emoji:'🥤',qty:${qty}});}
  "
  echo "OK: added drink '$name' x$qty"
  show_inventory
}

cmd_del() {
  local name="$1" qty="$2"
  if [ -z "$name" ]; then
    echo "Usage: $0 del \"<name>\" [qty]" >&2
    exit 1
  fi
  inv_txn "
    const hay=String('$name').toLowerCase();
    let removed=false;
    for(const cat of ['items','foods','drinks']){
      const list=inv[cat]||[];
      const idx=list.findIndex(i=>String(i.name||'').toLowerCase().includes(hay)||String(i.id||'').toLowerCase().includes(hay));
      if(idx>-1){
        const it=list[idx];
        if('$qty'!==''){it.qty=Math.max(0,(it.qty||0)-${qty:-9999}); if(it.qty===0){list.splice(idx,1);}}
        else{list.splice(idx,1);}
        removed=true;
        console.log('Removed from '+cat+': '+it.name);
        break;
      }
    }
    if(!removed)console.log('NOT FOUND: $name');
  "
  show_inventory
}

cmd_reset() {
  echo "Resetting inventory to starter defaults..."
  inv_txn "
    inv.foods=[{id:'sashimi',name:'Sashimi Ikan',en:'Fish Sashimi',jp:'お刺身',emoji:'🐟',qty:3},{id:'toast',name:'Roti Bakar',en:'Buttered Toast',jp:'トースト',emoji:'🍞',qty:2},{id:'strawberry-cake',name:'Kue Stroberi',en:'Strawberry Cake',jp:'イチゴケーキ',emoji:'🍰',qty:3}];
    inv.drinks=[{id:'sweet-tea',name:'Teh Manis',en:'Sweet Tea',jp:'甘いお茶',emoji:'🍵',qty:3},{id:'milk-coffee',name:'Kopi Susu',en:'Milk Coffee',jp:'カフェラテ',emoji:'☕',qty:2},{id:'milk',name:'Susu Segar',en:'Fresh Milk',jp:'牛乳',emoji:'🥛',qty:2}];
    inv.items=[{id:'love-potion',name:'Ramuan Cinta',en:'Love Potion',jp:'恋の薬',emoji:'💗',qty:2,aphrodisiac:true},{id:'perangsang',name:'Perangsang',en:'Aphrodisiac',jp:'媚薬',emoji:'🍬',qty:3,aphrodisiac:true},{id:'heat-drops',name:'Tetes Gairah',en:'Heat Drops',jp:'発情ドロップ',emoji:'💧',qty:2,aphrodisiac:true}];
  "
  show_inventory
}

cmd_menu() {
  while true; do
    echo ""
    echo "=== YuiHime Inventory Menu ==="
    echo "  1) Read inventory"
    echo "  2) Add custom item"
    echo "  3) Add aphrodisiac item (perangsang)"
    echo "  4) Add food"
    echo "  5) Add drink"
    echo "  6) Remove item"
    echo "  7) Reset to starter defaults"
    echo "  0) Exit"
    printf "Choice: "
    read -r choice
    case "$choice" in
      1) cmd_read ;;
      2)
        printf "Name: "; read -r n
        printf "Qty: "; read -r q
        printf "Emoji: "; read -r e
        cmd_add "$n" "${q:-1}" "${e:-📦}"
        ;;
      3)
        printf "Name: "; read -r n
        printf "Qty: "; read -r q
        cmd_aphro "$n" "${q:-1}"
        ;;
      4)
        printf "Name: "; read -r n
        printf "Qty: "; read -r q
        cmd_food "$n" "${q:-1}"
        ;;
      5)
        printf "Name: "; read -r n
        printf "Qty: "; read -r q
        cmd_drink "$n" "${q:-1}"
        ;;
      6)
        printf "Name: "; read -r n
        printf "Qty (empty = whole item): "; read -r q
        cmd_del "$n" "$q"
        ;;
      7) cmd_reset ;;
      0) echo "Bye."; exit 0 ;;
      *) echo "Invalid choice." ;;
    esac
  done
}

case "${1:-}" in
  "")     cmd_menu ;;
  read)   cmd_read ;;
  add)    cmd_add "$2" "$3" "$4" ;;
  aphro)  cmd_aphro "$2" "$3" "$4" ;;
  food)   cmd_food "$2" "$3" ;;
  drink)  cmd_drink "$2" "$3" ;;
  del)    cmd_del "$2" "$3" ;;
  reset)  cmd_reset ;;
  *)
    echo "Usage: $0 [read|add \"<n>\" [qty] [emoji]|aphro \"<n>\" [qty]|food \"<n>\" [qty]|drink \"<n>\" [qty]|del \"<n>\" [qty]|reset]" >&2
    exit 1
    ;;
esac
