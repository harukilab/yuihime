# LLM Centralization Policy (ABSOLUTE RULE)

## Core Directive
In this system, all connections to Large Language Models (LLMs) must be **strictly centralized**. No module, service, or component is allowed to maintain its own connection strings, model identifiers, or direct calls to AI providers (like Gemini).

## Access Protocol
1. **AI Thinking Source of Truth**: The `ProviderGatewayModule` (`id: 'provider-gateway'`) is the ONLY authorized gateway for LLM generation.
2. **Audio Synthesis Source of Truth**: The `TTSSelectorModule` (`id: 'tts-selector'`) is the ONLY authorized gateway for speech synthesis.
3. **Modular Hierarchy**:
   - `GeminiProvider.ts` / `WebSpeechTTS.ts`: Low-level implementations.
   - `ProviderGatewayModule.ts` / `TTSSelectorModule.ts`: Dispatchers/Gateways.
   - All other Modules: MUST obtain the selector from the `SystemRegistry` and call its `run` method.

## Implementation Examples

### LLM Access
```typescript
const gateway = SystemRegistry.getModule<CortexModule>('provider-gateway');
await gateway.run(prompt, state, context);
```

### TTS Access
```typescript
const tts = SystemRegistry.getModule<CortexModule>('tts-selector');
await tts.run(text, state, context);
```

## Prohibited Patterns (REJECTED)
- `const model = 'gemini-3-flash-preview';` (Hardcoded model IDs)
- `const provider = SystemRegistry.getProvider('gemini');` (Direct provider access outside of gateway)
- `fetch('/api/ai/generate', ...)` (Direct API calls outside of Provider modules)

## Rationale
This architecture ensures:
- **Hot-swappability**: We can change models or providers globally in one file.
- **Observability**: All AI traffic passes through a single evaluation point.
- **Resilience**: Fallback and retry logic is managed by the gateway, not duplicated across the system.
