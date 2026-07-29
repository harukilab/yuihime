import "dotenv/config";
import { executeGoogleSearch } from "../src/core/kernel/ai/generateSegment.js";

const queries = [
  "YuiHime AI Studio",
  "berita teknologi AI 2026",
  "siapa presiden Indonesia"
];

async function runTest() {
  console.log("[WEB_SEARCH_ZERO_KEY] Starting zero-key web search test...\n");

  for (const query of queries) {
    console.log(`\n>>> Query: "${query}"`);
    const start = Date.now();
    try {
      const results = await executeGoogleSearch(query);
      const elapsed = Date.now() - start;
      console.log(`<<< Completed in ${elapsed}ms — ${results.length} results returned:`);
      for (const r of results.slice(0, 5)) {
        console.log(`  [${r.url}]`);
        console.log(`    Title: ${r.title}`);
        console.log(`    Snippet: ${r.snippet?.slice(0, 120)}...`);
      }
    } catch (err: any) {
      console.error(`<<< FAILED for "${query}":`, err.message);
    }
  }

  console.log("\n[WEB_SEARCH_ZERO_KEY] Test complete.");
  process.exit(0);
}

runTest().catch(err => {
  console.error("[WEB_SEARCH_ZERO_KEY] Fatal:", err);
  process.exit(1);
});
