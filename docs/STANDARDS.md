# Neural Kernel Standards: I/O & Metadata

This document outlines the standardized interfaces for all kernel entities (Modules, Tools, Plugins) to ensure LLM compatibility and system stability.

## 1. Unified Metadata
Every entity must define its identity and capabilities using the following structure:
- **id**: Unique identifier (e.g., `tool.web.search`)
- **name**: Human-readable name
- **description**: Detailed documentation for LLM discovery
- **type**: `CORE`, `ADAPTER`, `PLUGIN`, or `TOOL`

## 2. Standardized I/O (IOTemplate)
All modular communication should be wrapped in an `IOTemplate`:
- **input**: The raw data provided to the module.
- **output**: The processed result.
- **metadata**: Tracking information (timestamp, correlationId, version).

## 3. Execution Feedback
Every operation must return an `ExecutionFeedback` object:
- **status**: `success` | `failure` | `partial_success`
- **result**: The functional payload.
- **errorDetails**: Contextual info for debugging or LLM self-correction.
- **metrics**: Performance data (duration, token usage).

## 4. LLM Interaction Standards
- **Input Pre-processing**: Format data into clean JSON or Markdown before sending to LLM.
- **Output Post-processing**: Use `StandardizedProcessor.parseLLMResponse` to safely extract JSON from LLM chatter.
- **Feedback Loop**: If a tool fails, pass the `errorDetails` back to the LLM to allow it to retry or pivot strategy.

## 5. File Structure
- `metadata.json`: Static metadata for discovery.
- `main.ts` / `index.ts`: Primary entry point implementation.
- `schema.json`: Input/Output constraints.
