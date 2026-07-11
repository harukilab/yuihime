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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMockLoopTest() {
  console.log("=== STARTING MOCK COGNITIVE LOOP TEST ===");

  // 1. Initialize DB
  const db = initializeDatabase();
  setupSchema(db);
  NeuralInterface.setDatabase(db);
  console.log("[MOCK_TEST] SQLite Database initialized.");

  // 2. Boot Kernel
  const kernel = Kernel.getInstance();
  await kernel.boot();
  console.log("[MOCK_TEST] Kernel booted.");

  // 3. Scan & register all standard modules
  await initializeCortexModules();
  console.log("[MOCK_TEST] Standard modules registered.");

  // 4. Register a MOCK provider-gateway to control the LLM's responses
  let callCount = 0;
  const mockGateway = {
    metadata: {
      id: "provider-gateway",
      name: "Mock Provider Gateway",
      description: "Controls the LLM outputs for testing the ReAct loop.",
      version: "2.0.0",
      type: ModuleType.CORTEX,
      phase: "PHASE 3: EVALUATION",
      order: 1
    },
    run: async (input: string, state: any, context: any) => {
      callCount++;
      console.log(`[MOCK_GATEWAY] LLM call #${callCount} received.`);
      
      if (callCount === 1) {
        // Turn 1: Return a tool call to perform web search
        console.log("[MOCK_GATEWAY] Turn 1: Emulating a tool_call response...");
        const responsePayload = {
          thought: "Saya perlu mencari tahu cuaca hari ini menggunakan web_search.",
          tool_calls: [
            {
              id: "call_abc123",
              tool: "web_search",
              args: { query: "cuaca Jakarta hari ini" }
            }
          ],
          final_answer: "",
          animations: ["THINKING"]
        };
        return {
          ...context,
          rawResult: JSON.stringify(responsePayload),
          activeProvider: "mock-provider"
        };
      } else {
        // Turn 2: Return the final answer using the observation
        console.log("[MOCK_GATEWAY] Turn 2: Emulating a final_answer response based on observations...");
        const responsePayload = {
          thought: "Selesai mencari cuaca Jakarta. Sekarang saya bisa menjawab Kakak.",
          tool_calls: [],
          final_answer: "Jakarta hari ini cerah dengan suhu sekitar 32 derajat Celcius, Kak! Jangan lupa minum air yaa, Yui khawatir nanti Kakak dehidrasi~ 💕",
          animations: ["SMILE", "WINK"]
        };
        return {
          ...context,
          rawResult: JSON.stringify(responsePayload),
          activeProvider: "mock-provider"
        };
      }
    }
  };

  SystemRegistry.register(mockGateway);
  console.log("[MOCK_TEST] Mock Provider Gateway registered successfully over the original.");

  // 5. Invoke NeuralInterface.processNeuralInput to run the whole pipeline
  const testInput = "Yui, gimana cuaca di Jakarta hari ini?";
  const testSender = "Kakak Test";
  const testContextId = "test_context_02";
  const testChatType = "test_direct_message";

  try {
    const startTime = Date.now();
    const result = await NeuralInterface.processNeuralInput(
      testInput,
      testSender,
      testContextId,
      testChatType
    );
    const duration = Date.now() - startTime;

    console.log("=== MOCK TEST COMPLETED SUCCESSFULLY ===");
    console.log(`Duration: ${duration}ms`);
    console.log("Final Speech Response:", result);

    const testResults = {
      timestamp: new Date().toISOString(),
      durationMs: duration,
      input: testInput,
      sender: testSender,
      response: result,
      status: "SUCCESS"
    };

    const resultsPath = path.join(__dirname, "mock_test_run_log.json");
    fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2), "utf8");
    console.log(`[MOCK_TEST] Results saved to ${resultsPath}`);
    
    // Clean exit to prevent active intervals from keeping the process alive
    process.exit(0);

  } catch (err: any) {
    console.error("=== MOCK TEST ENCOUNTERED AN ERROR ===");
    console.error(err);

    const errorResults = {
      timestamp: new Date().toISOString(),
      input: testInput,
      sender: testSender,
      error: err.message || String(err),
      status: "FAILED"
    };

    const resultsPath = path.join(__dirname, "mock_test_run_log.json");
    fs.writeFileSync(resultsPath, JSON.stringify(errorResults, null, 2), "utf8");
    console.log(`[MOCK_TEST] Error log saved to ${resultsPath}`);
    
    process.exit(1);
  }
}

runMockLoopTest().catch((e) => {
  console.error("Fatal Mock Test Execution Error:", e);
});
