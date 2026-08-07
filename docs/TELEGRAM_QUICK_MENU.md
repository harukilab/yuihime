# Telegram Quick Menu — Agent Guide

How to add new Telegram features (commands, buttons, care actions) the right way.

## Architecture (two files, one concern each)

| File | Role |
| --- | --- |
| `src/drivers/tools/telegram_quick_tools.ts` | Command registry (`tgQuickCommands`), routing (`handleTgQuickCommand`), callback routing (`handleTgCallback`), daemon/admin/cron/tools sub-commands. |
| `src/drivers/tools/telegram_quick_menu.ts` | Helper module (NOT a registered tool): `yuiStatusText`, `menuText`, `careMenuKeyboard`, `runCareAction`, `careInventoryView`, `fmtUptime`. |

- `telegram_quick_menu.ts` is imported statically by `telegram_quick_tools.ts` and bundled into `dist/server.cjs` with it. **Do not** register it in `RegistryInitializer.ts`.
- `telegram_quick_tools.ts` imports `{ fmtUptime, yuiStatusText, menuText, careMenuKeyboard, runCareAction, careInventoryView }` from `./telegram_quick_menu.js`.
- `telegram_quick_menu.ts` imports only types from `telegram_quick_tools.js` (`import type { TgReply, TgToolContext }`). Type-only imports are erased at build, so there is no runtime circular dependency.

## Key types

```ts
export interface TgReply { text: string; keyboard?: any; parse_mode?: string; }
export interface TgToolContext { ctx: any; db: any; settings: Record<string, any>; bot: any; startedAt?: number; }
export interface TgCommandDef {
  name: string; aliases?: string[]; description: string;
  adminOnly?: boolean; usage?: string;
  handler: (tc: TgToolContext, args: string) => Promise<TgReply>;
}
```

## How a chat command flows

```
/user says /care eat
  → server/telegram.ts → handleTgQuickCommand(rawText, tc)   (telegram_quick_tools.ts)
  → looks up tgQuickCommandMap (name + aliases)
  → def.handler(tc, args)     // e.g. /care → runCareAction(a, tc)
  → TgReply { text, keyboard, parse_mode }
```

## How a button callback flows

Buttons use `callback_data: "qt:<submenu>:<action>"`.

```
User taps 🍽️ Feed  (callback_data "qt:care:eat")
  → handleTgCallback("qt:care:eat", tc)                       (telegram_quick_tools.ts)
  → cmd starts with "care:" → runCareAction("eat", tc)
  → reply.edits the message: text + keyboard (falls back to careMenuKeyboard())
```

The result is `{ action: 'edit', text, keyboard }` — the inline message is **edited in place**, so keep buttons attached if you want the menu to persist for repeat use.

## Adding a new chat command

Add an entry to the `tgQuickCommands` array in `telegram_quick_tools.ts`:

```ts
{
  name: 'saldo',
  aliases: ['balance'],
  description: 'Show your balance',
  usage: '/saldo',
  handler: async (tc, args) => {
    return { text: `Your balance: ...` };
  }
}
```

- `adminOnly: true` restricts it to the configured Telegram admin.
- Registration is automatic (`tgQuickCommandMap` is built from the array). Never edit manual registration elsewhere.

## Adding a new Care action (e.g. "hair" — give Yui a haircut)

1. **Implement the action** in `runCareAction` in `telegram_quick_menu.ts`:

```ts
case 'hair':
  v.lastHair = now;
  v.hairTrimmed = true;
  text = '✂️ Yuihime gets a haircut — looking sharp!';
  break;
```

All care actions that mutate `lifeVitals` fall through to the shared tail that:
- writes `sh.lifeVitals` / `sh.lifeInventory` back to `agent_state.systemHealth`,
- returns the fresh `yuiStatusText` + `careMenuKeyboard()` so the menu stays open and the user can repeat instantly.

2. **Add a button** in `careMenuKeyboard()`:

```ts
{ text: '✂️ Hair', callback_data: 'qt:care:hair' }
```

3. **Chat alias** (optional) — the `/care` handler already passes any argument to `runCareAction`, so `/care hair` works with no extra wiring.

## Adding a Use button for inventory items

`careInventoryView` builds one row per item: **Use / Add / Delete**.
- Foods → `qt:care:invuse:foods:<idx>` (routes to `feedItem`)
- Drinks → `qt:care:invuse:drinks:<idx>` (routes to `drinkItem`)
- Custom items → `qt:care:invuse:items:<idx>` (generic "uses X"; aphrodisiac-named items max horniness)

The keyboard is returned by `invuse`/`invadd`/`invdel` replies, so the inventory view stays on screen for repeat use.

## Life-simulation values that care actions drive

Read from `state.systemHealth.lifeVitals` (module: `src/modules/agi/LifeSimulationModule.ts`).

- Time-based stats are derived from timestamps: `lastMeal` (hunger), `lastDrink` (thirst), `lastBath` (cleanliness), `lastPee`/`lastPoop` (pee/poop), `lastPlay` (play urge), `lastFish` (fish craving), `asleepSince` (sleep).
- Advance a timestamp forward to LOWER the stat; set a timestamp in the past to RAISE it.
- **Overfeed mechanic**: when `feedItem`/`drinkItem` detects the stat was already `<= 5` (Yui is full/hydrated), it drops `hungerOffset`/`thirstOffset` toward `overfeedFloor` and applies a **scaling fill boost** — each consecutive overfeed meal adds more Poop (from food) and Pee (from drinks): level 1 = 2×, level 2 = 3×, level 3 = 4×, … This also runs in the chat-consume path of `LifeSimulationModule.ts`.

## Conventions (mandatory)

- All UI text, replies, logs, comments: **English** (ID only in `UPDATE_LOG.md`).
- Never hardcode the character name — use `${characterName}` + `injectCharacterName()` where a name is needed in LLM-facing text.
- Sanitize LLM JSON with `raw.match(/\{[\s\S]*\}/)` before `JSON.parse()`.
- Keep each file < 1300 lines; if `telegram_quick_tools.ts` grows, move more helpers into `telegram_quick_menu.ts` or a new helper module.
- Do not import Node builtins dynamically in files consumed by Vite.

## Verify & deploy after every change

Server-only changes (this whole menu system is server-side):

```
npm run build:server 2>&1 | tail -3 &&
tools/yui-daemon.sh restart 2>&1 | tail -2 &&
sleep 3 && curl -s http://127.0.0.1:3000/api/health; echo
```

Then prepend `UPDATE_LOG.md` via `python3 tools/update_log.py`.

## Testing checklist

- `/care` (no args) → status + Care menu with buttons.
- Tap each button → message edits, status refreshes, keyboard persists.
- `/care eat` repeatedly while Yui is full → overstuffed message + Poop/Pee rise faster each time.
- `/care inventory` → each item row has Use/Add(+1/+5/+10)/Remove; tapping Use keeps the inventory open.
