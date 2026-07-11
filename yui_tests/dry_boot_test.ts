import "dotenv/config";
import { initializeDatabase, setupSchema } from "../src/core/database.js";
import { Kernel } from "../src/core/kernel/core.js";
import { initializeCortexModules } from "../src/core/RegistryInitializer.js";

async function testBoot() {
  console.log("[DRY_BOOT] Starting dry-boot diagnostics...");
  
  console.log("[DRY_BOOT] 1. Initializing database...");
  const db = initializeDatabase();
  console.log("[DRY_BOOT] 1.2. Running setupSchema...");
  setupSchema(db);
  
  console.log("[DRY_BOOT] 2. Booting Kernel...");
  const kernel = Kernel.getInstance();
  await kernel.boot();
  
  console.log("[DRY_BOOT] 3. Initializing Cortex Modules...");
  await initializeCortexModules();
  
  console.log("[DRY_BOOT] All systems booted successfully!");
}

testBoot().catch(err => {
  console.error("[DRY_BOOT] Failed:", err);
});
