import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { initializeDatabase, setupSchema } from "../src/core/database.js";
import { Kernel } from "../src/core/kernel/core.js";
import { initializeCortexModules } from "../src/core/RegistryInitializer.js";
import { Cortex } from "../src/core/cortex.js";
import { NeuralInterface } from "../src/core/kernel/NeuralInterface.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  console.log("=== STARTING COGNITIVE LOOP & ENGINE TEST ===");

  // 1. Initialize DB
  console.log("[TEST] Step 1: Initializing database...");
  const db = initializeDatabase();
  console.log("[TEST] Step 1.2: Setting up schema...");
  setupSchema(db);
  console.log("[TEST] Step 1.3: Setting database on NeuralInterface...");
  NeuralInterface.setDatabase(db);
  console.log("[TEST] SQLite Database initialized & bound to NeuralInterface successfully.");

  // 2. Boot Kernel
  console.log("[TEST] Step 2: Booting Kernel...");
  const kernel = Kernel.getInstance();
  await kernel.boot();
  console.log("[TEST] Kernel booted successfully.");

  // 3. Initialize Registry & scan modules
  console.log("[TEST] Step 3: Initializing Cortex Modules...");
  await initializeCortexModules();
  console.log("[TEST] Dynamic Cortex modules & tools registered successfully.");

  // 4. Instantiate Cortex and run a dry-run test
  console.log("[TEST] Step 4: Creating Cortex instance...");
  const cortex = new Cortex();
  console.log("[TEST] Cortex instance instantiated successfully.");

  // Prepare minimal inputs for a mock/dry-run thought
  const testInput = "Halo Yui! Apakah sirkuit batinmu bekerja dengan baik hari ini?";
  const testSender = "Kakak Test";
  const testContextId = "test_context_01";
  const testChatType = "test_direct_message";

  console.log(`[TEST] Sending message to NeuralInterface: "${testInput}"`);
  
  try {
    const startTime = Date.now();
    console.log("[TEST] Step 5: Invoking NeuralInterface.processNeuralInput...");
    const result = await NeuralInterface.processNeuralInput(
      testInput,
      testSender,
      testContextId,
      testChatType
    );
    const duration = Date.now() - startTime;

    console.log("=== TEST COMPLETED ===");
    console.log(`Duration: ${duration}ms`);
    console.log("Response Received:", result);

    const testResults = {
      timestamp: new Date().toISOString(),
      durationMs: duration,
      input: testInput,
      sender: testSender,
      response: result,
      status: "SUCCESS"
    };

    const resultsPath = path.join(__dirname, "test_run_log.json");
    fs.writeFileSync(resultsPath, JSON.stringify(testResults, null, 2), "utf8");
    console.log(`[TEST] Results saved to ${resultsPath}`);

  } catch (err: any) {
    console.error("=== TEST ENCOUNTERED AN ERROR ===");
    console.error(err);

    const errorResults = {
      timestamp: new Date().toISOString(),
      input: testInput,
      sender: testSender,
      error: err.message || String(err),
      status: "FAILED"
    };

    const resultsPath = path.join(__dirname, "test_run_log.json");
    fs.writeFileSync(resultsPath, JSON.stringify(errorResults, null, 2), "utf8");
    console.log(`[TEST] Error log saved to ${resultsPath}`);
  }
}

runTest().catch((e) => {
  console.error("Fatal Test Execution Error:", e);
});
