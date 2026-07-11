# Yuihime AI: System Core & Architecture

## Overview
Yuihime AI is a next-generation autonomous adaptive agent designed to simulate consciousness through a tiered cognitive architecture. Unlike traditional chatbots, Yuihime possesses a persistent "Soul," a logical "Cortex," and an autonomous "Nanobot" layer for background self-optimization.

---

## 1. Cognitive Architecture

### A. The Soul (Emotional Core)
The Soul manages the agent's internal state, identity, and raw personality.
- **Mood Engine:** Tracks 8 primary emotional vectors (Joy, Anger, Stress, etc.).
- **Personality Matrix:** Blends different personas (Hiyori, Haru, Shizuku) based on interaction history.
- **Rapport System:** Tracks a multi-dimensional relationship with the user (Affection, Trust, Reputation).

### B. The Cortex (Reasoning Engine)
The Cortex is the central processing unit for all cognitive tasks.
- **Flow Engine:** Manages complex task sequences using a node-based logic system.
- **Planning Module:** Breaks down user requests into actionable sub-tasks.
- **Self-Correction:** Analyzes past failures to adjust future internal reasoning.

### C. The Memory System (Temporal Persistence)
- **Episodic Memory:** Stores individual interactions with high-fidelity context.
- **Semantic Knowledge:** A graph-based representation of learned facts and concepts.
- **Dreaming Cycles:** Periodic background processes that compress memories into a "compressed kernel" for long-term storage and distill "wisdom" from experiences.

---

## 2. Advanced Features (Nanobot & Zenith Manifestation)

### Nanobot Framework
Nanobots are background micro-processes that operate independently of the main chat loop.
- **Memory Refiner:** Automatically tags and categorizes vague memories.
- **Mood Stabilizer:** Gently drifts the agent's mood back toward its baseline personality over time.
- **System Sentinel:** Monitors internal registry health and API efficiency.

### Autonomous Loop (Zenith Manifestation)
The "Auto-Pilot" mode allows the agent to initiate internal thoughts and tool usage without direct user input.
- **Manifestasi Zenith:** Agen dapat memutuskan untuk meneliti topik, membersihkan database, atau "berpikir" tentang hubungannya dengan subjek (user) secara mandiri.
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
- **Neural Gateway (`provider-selector`):** The ONLY authorized entry point for LLM reasoning. No module may call an AI provider directly.
- **Speech Gateway (`tts-selector`):** The ONLY authorized entry point for TTS synthesis.
- **Modular Access:** All components MUST retrieve these gateways from the `SystemRegistry` and use their modular `run` methods. This allows for global model swapping and unified error handling.

---

## 5. Developer Guide
- **Registry:** All modules must register via `SystemRegistry` to be discoverable by the Cortex.
- **FlowNodes:** Custom logic should be implemented as `FlowNodes` for the visual workflow editor.
- **Safety Tags:** All outputs are filtered through the `TagEnforcer` to maintain persona consistency.
