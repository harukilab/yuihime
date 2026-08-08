# Yui Data Reference — `tools/yui-data.sh`

> Single reference for reading/writing Yui's persisted state. Other AI agents
> should use this tool (via shell) instead of opening the DB directly. Read this
> file to learn the paths; run `tools/yui-data.sh` to act.
>
> Companion: `~/.yuihime/user_data/yui_status.md` for a human-readable status snapshot.

## Quick usage

```
bash tools/yui-data.sh state-read                    # dump full agent_state (JSON)
bash tools/yui-data.sh get <jsonPath>                # read one value
bash tools/yui-data.sh set <jsonPath> <value>        # write one value
bash tools/yui-data.sh push <arrayPath> <value>      # append to an array
bash tools/yui-data.sh add <jsonPath> <value>        # merge object / set
bash tools/yui-data.sh sys <pathInSystemHealth> <value>   # write inside systemHealth
bash tools/yui-data.sh virtual-body <field>          # read virtual_body.json field
bash tools/yui-data.sh vbody-set <field> <value>     # write virtual_body.json field (via addon)
```

`<value>` is auto-parsed: valid JSON stays JSON, integers/numbers stay numeric,
anything else becomes a string.

## Available jsonPath (dot-notation into agent_state)

| Path | Meaning |
|---|---|
| `status` | Overall status: `idle`, `asleep`, etc. |
| `mood.<key>` | Mood keys 0-100. Keys: `joy`, `anger`, `sadness`, `stress`, `irritation`, `excitement`, `embarrassment`, `curiosity`, `jealousy`, `loneliness`, `playfulness` |
| `mood.<neuro>` | Neuro: `dopamine`, `serotonin`, `oxytocin`, `noradrenaline` |
| `mood.<virtue>` | Virtues: `chastity`, `temperance`, `charity`, `diligence`, `patience`, `kindness`, `humility` |
| `mood.<sin>` | Sins: `lust`, `gluttony`, `greed`, `sloth`, `wrath`, `envy`, `pride` |
| `emotion.arousal` | Arousal 0-100 |
| `emotion.valence` | Valence -100..100 |
| `emotion.focus` | Focus 0-100 |
| `emotion.rapport` | Rapport 0-100 |
| `relation.uid` | User uid |
| `relation.trust` | Trust 0-100 |
| `relation.affection` | Affection 0-100 |
| `relation.reputation` | Reputation 0-100 |
| `systemHealth.lifeVitals.<vital>` | Care vitals 0-100: `hunger`, `thirst`, `cleanliness`, `pee`, `poop`, `sleepiness`, `horn`, `energy`, `purr`, `playUrge`, `fishCraving` |
| `systemHealth.lifeVitals.tailState` | Tail state string (e.g. `Puffed (menggembung takut)`, `Relaxed`) |
| `systemHealth.lifeVitals.earState` | Ear state string (e.g. `Relaxed`, `Folded`) |
| `systemHealth.lifeVitals.forbid` | Array of forbidden actions, e.g. `["play","fish"]` |
| `systemHealth.lifeInventory.foods` | Array of food items `{id,name,en,jp,emoji,qty}` |
| `systemHealth.lifeInventory.drinks` | Array of drink items `{id,name,en,jp,emoji,qty}` |
| `systemHealth.lifeInventory.items` | Array of custom/aphrodisiac items (has `aphrodisiac:true` for perangsang) |

## Virtual body fields (virtual-body / vbody-set)

`top`, `bottom`, `underwear`, `toys`, `used`, `accessories`, `pussy_insert`,
`anal_insert`, `nipples`, `clit`, `pose`, `location`, `wardrobe`, `note`,
`requested_by`.

## Examples

```
# Read
bash tools/yui-data.sh get mood.stress
bash tools/yui-data.sh get emotion.valence
bash tools/yui-data.sh get systemHealth.lifeVitals.horn
bash tools/yui-data.sh virtual-body underwear

# Write / inject
bash tools/yui-data.sh set mood.stress 30
bash tools/yui-data.sh sys lifeVitals.horn 40
bash tools/yui-data.sh set emotion.valence 60
bash tools/yui-data.sh push systemHealth.lifeInventory.items '{"id":"item_x","name":"X","emoji":"📦","qty":1,"custom":true}'
bash tools/yui-data.sh add systemHealth.lifeInventory.items '{"id":"item_y","name":"Y","emoji":"🔧","qty":2}'
bash tools/yui-data.sh vbody-set pose "standing, waving"
```

## Notes

- Writes go directly into the SQLite `agent_state` row (id=1). The daemon picks
  changes up on its next cycle.
- `vbody-set` uses the `virtual_body` addon, so `note` requires `confirmed=true`
  (handle separately if needed).
- Value with spaces must be quoted.
