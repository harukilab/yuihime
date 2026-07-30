import { TensorArtGenerateTool } from '../src/drivers/tools/tensorart_generate/index.js';

async function main() {
  // First, list available tools
  console.log('[TEST] Listing available tools...');
  const listResult = await TensorArtGenerateTool.execute({
    action: 'list_tools',
  }, {});
  console.log('[TEST] Available tools:', JSON.stringify(listResult, null, 2));
  
  if (listResult.status === 'success') {
    // Try generating with first available tool
    const tools = listResult.data || [];
    const toolName = tools[0]?.toolName || tools[0]?.name || 'anime_lab_wai_illustrious';
    console.log('[TEST] Using tool:', toolName);
    
    console.log('[TEST] Generating image...');
    const result = await TensorArtGenerateTool.execute({
      action: 'generate',
      prompt: 'a cute cat wearing a tiny top hat, digital art style',
      toolName: toolName,
      width: 512,
      height: 512
    }, {});
    
    console.log('[TEST] Result:', JSON.stringify(result, null, 2));
    console.log('[TEST] Status:', result.status);
  }
}

main().catch(err => {
  console.error('[TEST] Gagal:', err);
  process.exit(1);
});
