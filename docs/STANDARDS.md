# Neural Kernel Standards: I/O & Metadata

This document outlines the standardized interfaces for all kernel entities (Modules, Tools, Plugins) to ensure LLM compatibility and system stability.

## 1. Unified Metadata
Every entity must define its identity and capabilities using the following structure:
- **id**: Unique identifier (e.g., `provider-gateway`)
- **name**: Human-readable name
- **description**: Detailed documentation for LLM discovery
- **type**: one of `cortex`, `tool`, `addon`, `provider`, `tts`, `io`, `gateway` (see `ModuleType` in `shared/include/types.ts`)

## 2. Standardized I/O
Modules communicate through the standardized processor contract (`NeuralProcessor.executeStandardized` in `src/core/kernel/processor.ts`), which returns:
- **id**: The module id.
- **version**: Module version.
- **output**: The processed result.
- **feedback**: `{ status, message }` — execution status and message for the LLM loop.

## 3. Execution Feedback
Every operation returns a `feedback` object:
- **status**: `success` | `failure` | `partial_success` (string)
- **message**: Contextual info for debugging or LLM self-correction.

## 4. LLM Interaction Standards
- **Input Pre-processing**: Format data into clean JSON or Markdown before sending to LLM.
- **Output Post-processing**: Use `StandardizedProcessor.parseLLMResponse` to safely extract JSON from LLM chatter.
- **Feedback Loop**: If a tool fails, pass the error details back to the LLM to allow it to retry or pivot strategy.

## 5. File Structure
- A single TypeScript file per entity exporting a `metadata` object (id, name, description, type, phase, configSchema, etc.).
- Convention applies to `src/modules/`, `src/drivers/ai-providers/`, and `src/drivers/tools/` (tool drivers embed their manifest const in the same file — there are no `metadata.json` / `schema.json` sidecar files).
