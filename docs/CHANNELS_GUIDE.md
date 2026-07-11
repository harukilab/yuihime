# Yuihime Channel Integration Guide

This document explains how to add and maintain features for external channels (Telegram, Discord, Twitch) while keeping the core server clean.

## Architecture: The Neural Interface
Instead of writing logic directly in `server.ts`, all external messages are routed through the `NeuralInterface`.

### File Locations:
- **Core Processing**: `src/core/kernel/NeuralInterface.ts` (Handles AI prompts, memory, and state updates).
- **Settings/Config**: `src/modules/[BridgeName].ts` (Defines settings UI and defaults).
- **Daemon/Listener**: `server.ts` (Handles the connection and basic event listening).

## How to add a new feature (e.g., Image Generation for Telegram)

1. **Update settings**: Add the toggle for the feature in `src/modules/TelegramBridge.ts`.
2. **Update the Neural Interface**: 
   - Open `src/core/kernel/NeuralInterface.ts`.
   - Add the logic to the `processNeuralInput` method (e.g., checking if the AI wants to generate an image via tags).
3. **Keep `server.ts` Minimal**: Only use `server.ts` to receive the message and send the final response back to the platform.

## Cross-Channel Identity Memory
Yui can recognize you across different platforms (Telegram, Twitch, Discord).
- **Auto-Discovery**: If your username is the same across platforms, Yui will automatically load the same profile.
- **Manual Linking**: You can tell Yui: "I am Zeropride from Telegram" while chatting on Twitch. The AI will use an `<identity_update>` tag to link your accounts.
- **Shared Experience**: Your "Relationship" (Rapport/Affection) and "Memories" of your personality are shared across all platforms. However, the "Chat History" is separated by group or channel to keep conversations coherent.

## Why this way?
1. **Consistency**: Yui behaves the same way on Discord and Telegram because they use the same "Neural" brain.
2. **Stability**: `server.ts` is the heart of the app; frequent edits can lead to crashes.
3. **Scalability**: Adding a new platform (like WhatsApp or Matrix) is much easier when the brain is separated from the body.
