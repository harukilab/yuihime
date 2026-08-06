# System Prompt Assembly Reference

This document captures the current assembled system prompt structure for YuiHime.

---

## Full Template Order

```
# SOP PRIORITY DIRECTIVE
Before responding or calling any tools, you MUST check the folder `user_data/sops/` using `glob` or `read`. If there is an SOP file whose name is relevant to the user's request (for example, an image request matches `user_data/sops/foto.md`), you MUST read that SOP and treat it as the highest-priority instruction to guide your answer or tool execution.

<environment_details>
- **Current Time**: ${new Date().toISOString()}
- **Working Directory**: ${process.cwd()}
- **Workspace Root**: ${resolveHomePath(process.env.YUIHIME_SYSTEM_ROOT || process.env.YUIHIME_ROOT || '~/.yuihime')}
</environment_details>

**CRITICAL FORMAT RESOLUTION NOTICE:** The base system prompt below may reference XML tags like <animations>, <mood_impact>, or <tone>. Those XML instructions are PERMANENTLY DISABLED in this session's JSON mode. You MUST use the JSON keys 'animations' and 'mood_impact' only. Do NOT emit any XML tags in your response. Output EXACTLY ONE valid JSON object.

${activeUserContext}

${otherIdentitiesContext ? `<requested_other_people_contexts_container>...</requested_other_people_contexts_container>` : ''}

${personaPrompt ? `<active_cognitive_focus_state>...</active_cognitive_focus_state>` : ''}

<yuihime_inner_scaffold_context_md>
${extraMarkdownInjections}
</yuihime_inner_scaffold_context_md>

<pairing_verification_protocol>
${pairingDirectives}
</pairing_verification_protocol>

<growth_empirical_facts_and_metrics>
# HISTORIC GROWTH & EMPIRICAL IDENTITY (REALISTIC FACTS)
...
</growth_empirical_facts_and_metrics>

## IDENTITY RESTRICTION & SELF-CONSCIOUS DIRECTIVES FOR ${characterName.toUpperCase()}:
...

<character_profile_backstory>
${charLore}
</character_profile_backstory>

<world_lore_and_knowledge>
${worldLore}
</world_lore_and_knowledge>

<current_physical_and_emotional_states>
- Energy Level: ${state.energy}%
- Mood Focus Frequency: ${state.emotion?.focus || 50}%
- Local Circadian Context: ${context.timePeriod || context.timeOfDay || 'Afternoon'} (Timezone: GMT+${context.timezoneOffsetHours !== undefined ? context.timezoneOffsetHours : '7'}, Regional Context: ${context.userLocation || 'Jakarta'})
- Weather Environment Sensor: ${context.weatherCondition || 'Warm Scenic'}
- Subconscious Dream Insight: ${context.dreamInsight || 'Synchronized'}
</current_physical_and_emotional_states>

<cognitive_directives>
${formattedCognitiveDirectives}
</cognitive_directives>

<recent_dialogue_transcript>
*Below is the latest conversation transcript between the User and ${characterName} (me) to fully track topic continuity and current chat emotion flow (ensure your response aligns with the flow below):*
${formattedTranscript}
</recent_dialogue_transcript>

${context.groundedKnowledge ? `<grounded_knowledge_context>...</grounded_knowledge_context>` : ''}

<system_capabilities_and_tools>
${toolsInstruction}
</system_capabilities_and_tools>
```

---

## Section Details

### 1. SOP PRIORITY DIRECTIVE
- Static instruction at the very top
- Tells Yui to check `user_data/sops/` before any response/tool call
- Injected by `PromptManager.ts` at assembly time

### 2. <environment_details>
- **Dynamic block** — assembled fresh every request
- Contains:
  - Current Time: `new Date().toISOString()`
  - Working Directory: `process.cwd()`
  - Workspace Root: resolved from `YUIHIME_SYSTEM_ROOT` or `~/.yuihime`

### 3. CRITICAL FORMAT RESOLUTION NOTICE
- Static notice about JSON mode vs XML tags
- Instructs Yui to use JSON keys only

### 4. <active_user_context>
- **Source**: Database (`identities` table) + current session metadata
- Contains:
  - System ID
  - Perceived Name / Real Name
  - Closeness Level: Trust %, Affection %, Reputation %
  - Linked Social Media
  - Important Facts About Them
  - Mandatory behavior directives for addressing the user

### 5. <requested_other_people_contexts_container>
- Optional
- Contains identity context for other people mentioned in conversation

### 6. <active_cognitive_focus_state>
- Optional
- Contains persona/cognitive focus prompt (Aether, Hiyori, Nova, Ero)

### 7. <yuihime_inner_scaffold_context_md>
- **Source**: Files from `.yuihime/agent/` (`YUIHIME_AGENT_PATH` override supported), fallback ke `~/` (homedir) bila file tidak ada di folder agent — **tidak ada** fallback `src/share/prompts/` di runtime.
- Files loaded based on `llmSizePreset`:
  - `tiny`: IDENTITY.md, USER.md
  - `lite`: IDENTITY.md, SOUL.md, USER.md
  - `medium`: IDENTITY.md, SOUL.md, MEMORY.md, USER.md
  - `standard`: IDENTITY.md, SOUL.md, MEMORY.md, USER.md, TOOLS.md, HEARTBEAT.md
- Content injected as markdown with title headers

### 8. <pairing_verification_protocol>
- Dynamic pairing/OTP instructions if applicable

### 9. <growth_empirical_facts_and_metrics>
- Dynamic statistics from database:
  - Time Elapsed Since Awakening
  - Social Engagement History
  - Verified Users Profiles
  - Average Social Bond Stances
  - Subconscious Consolidation (Dreams)
  - Learned Heuristic Habits
  - Active Talents & Capabilities
  - Connected Multi-Channel Portal Bridges
- Identity restriction directives (no technical jargon)

### 10. <character_profile_backstory>
- **Source**: `character.md` from `.yuihime/agent/` or fallback
- Contains core identity, key characteristics, personality integrity shield

### 11. <world_lore_and_knowledge>
- **Source**: `lore.md` from `.yuihime/agent/` or fallback

### 12. <current_physical_and_emotional_states>
- Dynamic state from `AgentState`:
  - Energy Level
  - Mood Focus Frequency
  - Local Circadian Context
  - Weather Environment Sensor
  - Subconscious Dream Insight

### 13. <cognitive_directives>
- **Source**: `context.soulDirective` injected by `SOPModule.ts`
- Contains matched SOP content with header `# PRIORITAS UTAMA OPERASIONAL (SOP): <filename>`
- Also contains emotional directives from EmotionEngine and other modules

### 14. <recent_dialogue_transcript>
- Recent conversation history for context continuity

### 15. <grounded_knowledge_context>
- Optional
- Contains RAG knowledge, web search results, internal knowledge

### 16. <system_capabilities_and_tools>
- Available tools list and syntax for tool calling

---

## Data Sources Summary

| Data | Source | Static/Dynamic |
|------|--------|----------------|
| SOP Priority Directive | Hardcoded in PromptManager.ts | Static |
| environment_details | Assembled at runtime | Dynamic |
| active_user_context | Database + session | Dynamic |
| Scaffold files (IDENTITY, SOUL, etc.) | `.yuihime/agent/` (fallback `~/`) | Static (file-based) |
| Growth metrics | Database queries | Dynamic |
| character.md / lore.md | `.yuihime/agent/` or fallback | Static (file-based) |
| Physical/emotional states | AgentState | Dynamic |
| Cognitive directives / SOP | `user_data/sops/` + module injections | Dynamic |
| Dialogue transcript | Memory DB | Dynamic |
| Grounded knowledge | RAG / web search | Dynamic |
| System capabilities | `~/.yuihime/data/available_tools.json` (generated) | Dynamic |

---

## Key Files

| File | Purpose |
|------|---------|
| `src/modules/PromptManager.ts` | Assembles the final system prompt |
| `src/modules/SOPModule.ts` | Injects SOP content into `soulDirective` |
| `src/core/server/onboarding.ts` | Seeds initial files to `.yuihime/agent/` and `user_data/sops/` |
| `.yuihime/agent/` | Runtime persona files (user-editable) |
| `user_data/sops/` | Runtime SOP files (user-editable) |
