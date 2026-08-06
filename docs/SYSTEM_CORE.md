# Yuihime AI: System Core & Architecture

## Overview
Yuihime AI is a next-generation autonomous adaptive agent designed to simulate consciousness through a tiered cognitive architecture. Unlike traditional chatbots, Yuihime possesses a persistent "Soul," a logical "Cortex," and a background "Circuit" layer for self-optimization.

---

## 1. Cognitive Architecture

### A. The Soul (Emotional Core)
The Soul manages the agent's internal state, identity, and raw personality.
- **Mood Engine:** Tracks 8 primary emotional vectors (Joy, Anger, Stress, etc.).
- **Personality Matrix:** Blends different neural core personas (aether, hiyori, nova, ero) based on interaction history.
- **Rapport System:** Tracks a multi-dimensional relationship with the user (Affection, Trust, Reputation).

### B. The Cortex (Reasoning Engine)
The Cortex is the central processing unit for all cognitive tasks.
- **Cortex Pipeline:** Processes cognition through a 6-phase modular pipeline (`aggregation → soul → compression → reflect → finalize → logic`) driven by `SystemRegistry.runCortexPhase`.
- **Planning Module:** Breaks down user requests into actionable sub-tasks.
- **Self-Correction:** Analyzes past failures to adjust future internal reasoning via the `NeuralVerifierModule` (English correction keywords).

### C. The Memory System (Temporal Persistence)
- **Episodic Memory:** Stores individual interactions with high-fidelity context.
- **Semantic Knowledge:** A graph-based representation of learned facts and concepts.
- **Dreaming Cycles:** Periodic background processes that compress memories into a "compressed kernel" for long-term storage and distill "wisdom" from experiences.

---

## 2. Advanced Features (Nanobot & Cortex Background Loop)

### Background Circuits
Background micro-processes run independently of the main chat loop via `NeuralCircuitManager`.
- **Memory Refiner Circuit:** Automatically tags and categorizes vague memories (≈120s interval).
- **Mood Stabilizer Circuit:** Gently drifts the agent's mood back toward its baseline personality over time (1 min interval).

### Autonomous Loop (Cortex Background Loop)
The "Auto-Pilot" mode allows the agent to initiate internal thoughts and tool usage without direct user input.
- **Cortex Background Loop:** The agent can decide to research topics, clean up the database, or "think" about its relationship with the user independently.
- **Autonomous Feedback:** Tasks can loop until a self-defined "Success Condition" is met.

---

## 3. Tooling & Integrations
- **WebSearch:** Real-time data retrieval via Google Search.
- **Code Interpreter:** Secure sandbox for executing TypeScript/JS calculations.
- **GitHub Tool:** Integration for managing repositories and documentation.
- **Emotion Tools:** Capability to simulate physical gestures and facial expressions via the VTuber Avatar.

---

## 4. Centralized AI & Speech Gateway (ABSOLUTE RULE)
To ensure system consistency, scalability, and observability, all AI and Speech operations are strictly centralized:
- **Neural Gateway (`provider-gateway`):** The ONLY authorized entry point for LLM reasoning. No module may call an AI provider directly.
- **Speech Gateway (`tts-selector`):** The ONLY authorized entry point for TTS synthesis.
- **Modular Access:** All components MUST retrieve these gateways from the `SystemRegistry` and use their modular `run` methods. This allows for global model swapping and unified error handling.

---

## 5. Developer Guide
- **Registry:** All modules must register via `SystemRegistry` (auto-registered by loaders / `RegistryInitializer`) to be discoverable by the Cortex.
- **Custom Logic:** Implement logic as a Cortex module exposing `metadata.phase` and `run()`. There is no visual workflow editor; only a `NeuralWorkflow` type + `StorageService.getWorkflow()`.
- **Safety Tags:** Outputs may optionally be filtered by `NeuralVerifierModule` `strictTagEnforcement` (default OFF) to maintain persona consistency.
