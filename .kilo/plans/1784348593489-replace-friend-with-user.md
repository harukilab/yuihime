# Plan: Replace "Friend" with "user" as default user address

## Goal
Replace all remaining generic `"Friend"` fallback user-addressing across runtime prompts, fallback strings, UI samples, and tool descriptions with the neutral lowercase `"user"`. No honorifics, no personal names.

## Context
Previous pass already removed `"Kakak"`/`"Kak"` and replaced them with `"Friend"`. The user now wants the default address to be `"user"` instead of `"Friend"`. Affects ~176 occurrences across ~30 files.

## Decision
Use `"user"` (lowercase) as the single neutral fallback when no user name is known. It is language-neutral, requires no capitalization rules, and contains no honorific baggage.

## Replacement Rules
- Runtime fallbacks: `'Friend'` → `'user'`
- Prompt-injected instructions: `"Friend"` → `"user"`
- UI sample text / placeholders / examples: `"Friend"` → `"user"`
- Tool descriptions: `"Friend"` → `"user"`
- Log / comment strings: `"Friend"` → `"user"`
- Do NOT change `"Friend"` when it appears inside a proper noun or non-user-facing identifier that is unrelated to user addressing (none expected, but review each match).

## Files to Modify
1. `src/modules/PromptManager.ts`
   - Line 432: `(context.viewerIdentity?.perceivedName || 'Friend')` → `(context.viewerIdentity?.perceivedName || 'user')`
   - Line 722: `${context.viewerIdentity?.perceivedName || context.userName || 'Friend'}` → `... || 'user'`
   - Line 731: `"Friend"` → `"user"`

2. `src/share/prompts/system_prompt.md`
   - Line 22: `"Friend"` → `"user"`

3. `src/core/PromptRegistry.ts`
   - Lines 191, 203: `"Friend"` → `"user"` in `cortex:json_enforcement` example

4. `src/core/kernel/processor.ts`
   - Lines 996-1008: `"Friend"` → `"user"` in offline fallback quotes

5. `src/core/cortex/cortexThinkEngine.ts`
   - Lines 414, 1007, 1505, 1509, 1528, 1530, 1612, 1616, 1635, 1692: `"Friend"` → `"user"`

6. `src/core/kernel/MultiChannelQueue.ts`
   - Lines 617, 625-646, 650, 665, 672, 673, 797: `"Friend"` → `"user"`

7. `src/core/server/routes/cortexRouter.ts`
   - Lines 464, 501, 1139: `"Friend"` → `"user"`

8. `src/core/server/routes/datasetRouter.ts`
   - Lines 122, 229: `"Friend"` → `"user"`

9. `src/core/available_tools.json`
   - Lines 14, 45: `"Friend"` → `"user"`

10. `src/modules/LocalNanoNLPModule.ts`
    - Lines 17-27, 460-465, 522-552, 576-592, 618-630, 634, 653-656, 660: `"Friend"` → `"user"`

11. `src/modules/SpontaneousProactiveModule.ts`
    - Line 147: `"Friend"` → `"user"`

12. `src/modules/ProviderGatewayModule.ts`
    - Line 5: `"Friend"` → `"user"`

13. `src/drivers/tools/messaging_integration/index.ts`
    - Line 221: `"Friend"` → `"user"`

14. `src/bin/terminal.ts`
    - Lines 208, 297: `"Friend"` → `"user"`

15. `src/ui/ModularSettings.tsx`
    - Lines 823, 825: `"Friend"` → `"user"`

16. `src/ui/CronManager.tsx`
    - Line 281: `"Friend"` → `"user"`

17. `src/ui/StageTab.tsx`
    - Lines 57-62, 532, 1186: `"Friend"` → `"user"`

18. `src/ui/IdentitiesTab.tsx`
    - Lines 159, 189, 199: `"Friend"` → `"user"`

19. `src/ui/stage/RelationAndSpontaneousDrawer.tsx`
    - Line 98: `'Friend'` → `'user'`

20. `src/ui/modular-settings/ProviderPlayground.tsx`
    - Line 69: `"Friend"` → `"user"`

21. `src/ui/train/DatasetExport.tsx`
    - Lines 19, 260: `"Friend"` → `"user"`

22. `src/modules/EmotionEngine.ts`
    - Lines 714, 716, 718, 720, 722, 754: `"Friend"` → `"user"`

23. `src/core/server/routes/identitiesRouter.ts`
    - Lines 272, 350, 361, 374, 392: `"Friend"` → `"user"`

24. `src/core/server/routes/telegramRouter.ts`
    - Line 215: `"Friend"` → `"user"`

25. `src/core/kernel/CognitiveScheduler.ts`
    - Line 33: `"Friend"` → `"user"`

26. `src/core/cortex/dynamicToolSynthesizer.ts`
    - Lines 105, 107: `"Friend"` → `"user"`

27. `src/modules/LiveStatusToolsModule.ts`
    - Lines 16, 71: `"Friend"` → `"user"`

28. `src/drivers/ai-providers/OfficialChatProvider.ts`
    - Line 83: `"Friend"` → `"user"`

29. `src/App.tsx`
    - Line 1793: `"Friend"` → `"user"`

30. `src/ui/stage/stageConstants.ts`
    - Line 36: `"Friend"` → `"user"`

## Out of Scope
- `src/share/prompts/build-info.json` (generated/bundled file; per previous plan, update source markdown instead. If the generator embeds the old text, it will need regeneration, but that is out of scope for this edit pass.)
- Any `"Friend"` inside `.md` documentation files that are not runtime prompts.

## Validation
- `grep -r "Friend" src/` in `.ts`, `.tsx`, `.json`, and `.md` prompt files must show zero matches for generic user-address usage.
- `npm run lint` must pass.
