# Yuihime Channel Integration Guide

This document explains how to add and maintain features for external channels (Telegram, Discord, Twitch) while keeping the core server clean.

## Architecture: The Neural Interface
Instead of writing logic directly in `server.ts`, all external messages are routed through the `NeuralInterface`.

### File Locations:
- **Core Processing**: `src/core/kernel/NeuralInterface.ts` (Handles AI prompts, memory, and state updates).
- **Bridge Implementations**: `src/core/server/telegram.ts` (Telegram bot) and `src/core/server/discord.ts` (Discord bot). Settings/config come from the `[telegram_bridge]` / `[discord_bridge]` / `[twitch_bridge]` TOML keys read in `src/core/kernel/settings.ts`.
- **Daemon/Listener**: `server.ts` (Handles the connection and basic event listening, wired via `initializeBot` / `initializeDiscord`).

> **Note:** Twitch is currently **config-only** (`[twitch_bridge]`, default disabled). No Twitch driver/listener exists yet.

## How to add a new feature (e.g., Image Generation for Telegram)

1. **Update settings**: Add the toggle for the feature in the `[telegram_bridge]` config section (settings UI + defaults).
2. **Update the Neural Interface**: 
   - Open `src/core/kernel/NeuralInterface.ts`.
   - Add the logic to the `processNeuralInput` method (e.g., checking if the AI wants to generate an image via tags).
3. **Keep `server.ts` Minimal**: Only use `server.ts` to receive the message and send the final response back to the platform.

## Cross-Channel Identity Memory
Yui can recognize you across different platforms (Telegram, Twitch, Discord).
- **Auto-Discovery**: If your username is the same across platforms, Yui will match `perceivedName` and auto-register missing identities. Each platform is tagged with a `chatType:userName` tag; cross-platform profiles are merged via `deduplicateAndMergeIdentities` or explicit pairing.
- **Manual Linking**: Use the `pair_account` tool (OTP claim-code flow via `/api/pair/*`) to link accounts. The link is persisted as `telegram_users.context = linked_identity:<id>`.
- **Shared Experience**: Your "Relationship" (Rapport/Affection) and "Memories" of your personality are shared across all platforms. However, the "Chat History" is separated by group or channel to keep conversations coherent.

## Why this way?
1. **Consistency**: Yui behaves the same way on Discord and Telegram because they use the same "Neural" brain.
2. **Stability**: `server.ts` is the heart of the app; frequent edits can lead to crashes.
3. **Scalability**: Adding a new platform is much easier when the brain is separated from the body.
