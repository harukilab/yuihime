# PRD: Yuihime Modular Plug-and-Play System & Dream Simulation

## 1. Vision
To transform Yuihime from a static application into a dynamic, extensible agentic platform where features (modules, addons, and logic layers) can be hot-swapped without modifying the core kernel or existing modules.

## 2. Technical Objectives
- **Zero-Touch Core**: Adding or removing a module must require zero changes to `cortex.ts`, `soul.ts`, or any other core file.
- **Config-Driven**: Every parameter that governs a module's behavior must be defined in a configuration file (`system.config.json` or `config.toml`) or via a dynamic `configSchema`.
- **Atomic Modules**: Modules must be self-contained units of logic with well-defined inputs and outputs.
- **Dream Simulation**: Implement a "Dream Core" that goes beyond narrative synthesis to simulate hypothetical future scenarios and alternate realities based on stored memories.

## 3. Features: Modular Architecture
### 3.1. Dynamic Discovery
- The system must automatically detect modules in designated directories (`/modules`, `/addons`, `/services/tools`).
- Modules should register their own metadata, including triggers and configuration schemas.

### 3.2. Lifecycle Management
- **Initialization**: Modules load their settings from persistence or global config on startup.
- **Execution**: Modules are called by the `FlowEngine` or `Cortex` based on their phase (Aggregation, Compression, Evaluation, soul, etc.).
- **Persistence**: Modules manage their own state persistence using `StorageService`.

## 4. Features: Dream Simulation (Scenario Engine)
### 4.1. Hypothetical Projection
- The agent analyzes recent memories and selects a "pivot point."
- It simulates a "what if" scenario (e.g., "What if the user had rejected my previous advice?").
- It generates a "Dream Log" detailing the outcome and a "Learned Insight."

### 4.2. Future Possibilities
- The agent explores 3 potential future paths based on current project goals.
- These projections are stored as `Dream` objects in the database.

### 4.3. Integration
- Dreams are reflected upon during the `reflect` phase.
- Positive outcomes from successful simulations are injected back into the `AdaptiveLearningModule` as positive reinforcement.

## 5. Constraints
- **Anti-Hardcoding**: No strings or magic numbers related to specific modules are allowed in the kernel.
- **Dependency Isolation**: Modules should not import other specific modules if possible; they should communicate via the shared `context` or `state`.
