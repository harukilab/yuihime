import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { initializeDatabase, setupSchema } from "../src/core/database.js";
import { Kernel } from "../src/core/kernel/core.js";
import { initializeCortexModules } from "../src/core/RegistryInitializer.js";
import { SystemRegistry } from "../src/core/registry.js";
import { Cortex } from "../src/core/cortex.js";
import { NeuralInterface } from "../src/core/kernel/NeuralInterface.js";
import { ModuleType } from "../src/include/types.js";

// Global logging interceptor to capture output before process hang
const logFile = path.join(process.cwd(), "yui_tests", "diagnostic_run.log");
if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

const originalLog = console.log;
console.log = function(...args) {
  const line = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ') + "\n";
  fs.appendFileSync(logFile, line);
  originalLog.apply(console, args);
};

const originalError = console.error;
console.error = function(...args) {
  const line = "[ERROR] " + args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ') + "\n";
  fs.appendFileSync(logFile, line);
  originalError.apply(console, args);
};

async function diagnostic() {
  console.log("[DIAG] Step 1: Initializing Database...");
  const db = initializeDatabase();
  console.log("[DIAG] Database initialized successfully.");

  console.log("[DIAG] Step 2: Setting up schema...");
  setupSchema(db);
  console.log("[DIAG] Schema set up successfully.");

  console.log("[DIAG] Step 3: Setting database on NeuralInterface...");
  NeuralInterface.setDatabase(db);
  console.log("[DIAG] Database set on NeuralInterface.");

  console.log("[DIAG] Step 4: Booting Kernel...");
  const kernel = Kernel.getInstance();
  await kernel.boot();
  console.log("[DIAG] Kernel booted successfully.");

  console.log("[DIAG] Step 5: Initializing Cortex Modules...");
  await initializeCortexModules();
  console.log("[DIAG] Cortex Modules initialized successfully.");

  console.log("[DIAG] Step 6: Instantiating Cortex...");
  const cortex = new Cortex();
  console.log("[DIAG] Cortex instantiated successfully.");

  console.log("[DIAG] Step 7: Creating Mock Gateway...");
  const mockGateway = {
    metadata: {
      id: "provider-gateway",
      name: "Mock Provider Gateway",
      description: "Mock gateway for diagnostics",
      version: "2.0.0",
      type: ModuleType.CORTEX,
      phase: "PHASE 3: EVALUATION",
      order: 1
    },
    run: async (input: string, state: any, context: any) => {
      console.log("[DIAG_MOCK_GATEWAY] run() called!");
      return {
        ...context,
        rawResult: JSON.stringify({
          thought: "Thinking...",
          tool_calls: [],
          final_answer: "Hello from diagnostic mock gateway!",
          animations: ["SMILE"]
        }),
        activeProvider: "mock"
      };
    }
  };
  SystemRegistry.register(mockGateway);
  console.log("[DIAG] Mock Gateway registered successfully.");

  console.log("[DIAG] Step 8: Invoking cortex.think directly...");
  const result = await cortex.think(
    "Hi Yui",
    [], // memories
    [], // dreams
    [], // capabilities
    {
      status: "idle",
      energy: 100,
      mood: { joy: 50, anger: 0, sadness: 0, stress: 0, irritation: 0, excitement: 10, embarrassment: 0, curiosity: 50, dopamine: 15, serotonin: 50, oxytocin: 30, noradrenaline: 10, lastUpdate: Date.now() },
      emotion: { arousal: 30, valence: 50, focus: 50, rapport: 30, lastUpdate: Date.now() },
      relation: { uid: "diag_user_id", trust: 50, affection: 10, reputation: 50, lastInteraction: Date.now() },
      activePersonaId: "hiyori"
    } as any, // state
    [], // heuristics
    "Diagnostic User", // senderName
    [], // allIdentities
    { id: "hiyori", name: "Hiyori", prompt: "You are Yui, a cute anime companion." } as any, // activePersona
    "diag_context_id",
    "web"
  );
  console.log("[DIAG] cortex.think completed directly with result:", result);

  process.exit(0);
}

diagnostic().catch(err => {
  console.error("[DIAG_FATAL]", err);
  process.exit(1);
});
