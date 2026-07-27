import "dotenv/config";
import { initializeDatabase, setupSchema } from "../src/core/database.js";
import { Kernel } from "../src/core/kernel/core.js";
import { initializeCortexModules } from "../src/core/RegistryInitializer.js";
import { SubAgentRegistry } from "../src/core/agents/SubAgentRegistry.js";
import { SubAgentDelegationModule } from "../src/modules/SubAgentDelegationModule.js";

async function testSubAgent() {
  console.log("====== MEMULAI PENGUJIAN SUB-AGENT YUI ======");

  // 1. Inisialisasi DB & Kernel
  const db = initializeDatabase();
  setupSchema(db);
  const kernel = Kernel.getInstance();
  await kernel.boot();

  // 2. Load Cortex Modules & Registrasi Sub-Agent
  await initializeCortexModules();

  const availableAgents = SubAgentRegistry.getAll();
  console.log(`\n[TEST] Sub-agent terdaftar: ${availableAgents.length}`);
  availableAgents.forEach(agent => {
    console.log(`  - ID: ${agent.id} | Nama: ${agent.name} | Capabilities: [${agent.capabilities.join(", ")}]`);
  });

  // 3. Uji Evaluasi Input (Apakah Trigger Delegasi Berfungsi?)
  const testInputs = [
    { text: "Tolong cari tahu (research) tentang perkembangan AI terbaru", expectedToDelegate: true },
    { text: "Halo Yui, apa kabar hari ini?", expectedToDelegate: false }
  ];

  console.log("\n[TEST] Simulasi Evaluasi Input:");
  const mockState: any = { mood: {}, emotion: {}, relation: {} };

  for (const item of testInputs) {
    const mockContext: any = {
      config: {
        subAgentDelegation: {
          enableSubAgents: true,
          maxConcurrentSubAgents: 3,
          delegationThreshold: 0.5
        }
      }
    };

    console.log(`\nInput: "${item.text}"`);
    const outputContext = await SubAgentDelegationModule.run(item.text, mockState, mockContext);
    const delegationInfo = outputContext.subAgentDelegation;

    if (delegationInfo.delegated) {
      console.log(`  ➜ DELEGATED ke agent: ${delegationInfo.agentId} (Sesuai ekspektasi: ${item.expectedToDelegate})`);
    } else {
      console.log(`  ➜ TIDAK DELEGATED (Alasan: ${delegationInfo.reason}) (Sesuai ekspektasi: ${!item.expectedToDelegate})`);
    }
  }

  console.log("\n====== PENGUJIAN SUB-AGENT SELESAI ======");
  process.exit(0);
}

testSubAgent().catch(err => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
