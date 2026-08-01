import { SystemRegistry } from '../shared/core/registry.js';
import { handleTgQuickCommand, handleTgCallback } from '../src/drivers/tools/telegram_quick_tools/index.js';

const FAKE_MODEL = 'anime_lab_wai_illustrious';

const mockTool = {
  metadata: { id: 'generate_image', type: 'tool', name: 'generate_image' },
  execute: async (args: any, ctx: any) => {
    if (args.action === 'list_tools') {
      return {
        status: 'success',
        data: [
          { tool_id: FAKE_MODEL, name: 'Anime Lab WAI' },
          { tool_id: 'jc_grassimoon', name: 'Grassimoon' }
        ]
      };
    }
    if (args.action === 'generate') {
      const call = { args, ctx };
      (globalThis as any).__lastGenerateCall = call;
      return {
        status: 'success',
        data: {
          localPath: '/tmp/fake.png',
          toolName: args.toolName,
          metadata: { width: args.width, height: args.height }
        }
      };
    }
    return { status: 'error', error: { message: 'unknown action' } };
  }
};

const mockProvider = {
  metadata: { id: 'gemini', type: 'provider', models: ['gemini-2.0-flash'] },
  generate: async (prompt: string, context: any) => {
    (globalThis as any).__lastProviderCall = { prompt, context };
    if ((globalThis as any).__providerSilent) {
      return JSON.stringify({ toolName: 'jc_grassimoon', prompt: 'silent yui prompt' });
    }
    return JSON.stringify({
      toolName: 'jc_grassimoon',
      width: 768,
      height: 512,
      prompt: 'polished yui prompt, cinematic lighting'
    });
  }
};

function makeTc(chatId: number): any {
  return {
    ctx: { chat: { id: chatId }, from: { id: chatId } },
    db: null,
    settings: {
      'telegram_quick_tools': { enabled: true },
      'telegram_bridge': { adminId: '999000111' },
      generate_image: { defaultToolName: FAKE_MODEL }
    },
    bot: null
  };
}

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('[FAIL]', msg);
    process.exitCode = 1;
  } else {
    console.log('[PASS]', msg);
  }
}

async function main() {
  SystemRegistry.register(mockTool);
  SystemRegistry.register(mockProvider);
  const tc = makeTc(999000111);

  // 1. /img without model -> keyboard picker + prompt stored
  const r1 = await handleTgQuickCommand('/img anime girl, sunset', tc);
  assert(r1.handled === true, '/img handled');
  assert(r1.reply?.keyboard?.inline_keyboard?.length >= 2, '/img returns inline keyboard');
  const buttons = r1.reply!.keyboard!.inline_keyboard!.flat();
  const hasYui = buttons.some((b: any) => b.callback_data === 'qt:img:yui');
  const hasDefault = buttons.some((b: any) => b.callback_data === 'qt:img:default');
  const hasModel = buttons.some((b: any) => b.callback_data === 'qt:img:model:anime_lab_wai_illustrious');
  const hasCancel = buttons.some((b: any) => b.callback_data === 'qt:img:cancel');
  assert(hasYui, 'keyboard has Yui mode button');
  assert(hasDefault, 'keyboard has Default button');
  assert(hasModel, 'keyboard has model buttons from list_tools');
  assert(hasCancel, 'keyboard has Cancel button');
  assert(/1024x1024/.test(r1.reply!.text), '/img defaults to 1024x1024');

  // 2. /img with explicit model -> generate directly (no keyboard)
  const r2 = await handleTgQuickCommand(`/img model:${FAKE_MODEL} anime boy`, tc);
  assert(r2.reply?.keyboard == null, '/img model:x generates directly without keyboard');
  assert((globalThis as any).__lastGenerateCall.args.width === 1024, 'explicit model call uses 1024 width');

  // 3. callback img:model:* -> generate with picked model
  await handleTgQuickCommand('/img cat', tc);
  const r3 = await handleTgCallback('qt:img:model:jc_grassimoon', tc);
  assert(r3?.action === 'edit', 'img:model callback returns edit');
  const lastCall3 = (globalThis as any).__lastGenerateCall.args;
  assert(lastCall3.toolName === 'jc_grassimoon', 'img:model uses picked model');
  assert(lastCall3.prompt === 'cat', 'img:model keeps original prompt');
  assert(/1024x1024/.test(r3!.text!), 'img:model confirmation shows dims');

  // 4. callback img:yui -> LLM routing (mock provider)
  await handleTgQuickCommand('/img drake, meme', tc);
  const r4 = await handleTgCallback('qt:img:yui', tc);
  const lastCall4 = (globalThis as any).__lastGenerateCall.args;
  assert(lastCall4.toolName === 'jc_grassimoon', 'Yui mode picks model via LLM');
  assert(lastCall4.width === 768 && lastCall4.height === 512, 'Yui mode picks dims via LLM');
  assert(lastCall4.prompt.includes('polished yui prompt'), 'Yui mode polishes prompt');
  assert(r4?.text!.includes('✅'), 'Yui mode returns success text');

  // 5. callback img:default -> default model
  await handleTgQuickCommand('/img nasi goreng', tc);
  const r5 = await handleTgCallback('qt:img:default', tc);
  const lastCall5 = (globalThis as any).__lastGenerateCall.args;
  assert(lastCall5.toolName === FAKE_MODEL, 'img:default uses fallback model');

  // 6. callback img:cancel -> clears job
  await handleTgQuickCommand('/img sate ayam', tc);
  const r6 = await handleTgCallback('qt:img:cancel', tc);
  assert(r6?.text!.includes('cancelled'), 'img:cancel returns cancel text');
  const r6b = await handleTgCallback('qt:img:default', tc);
  assert(r6b?.text!.includes('expired'), 'job cleared after cancel');

  // 7. dimension override + Yui mode falls back to job dims when LLM is silent
  (globalThis as any).__providerSilent = true;
  await handleTgQuickCommand('/img 512x512 kucing', tc);
  const r7 = await handleTgCallback('qt:img:yui', tc);
  const lastCall7 = (globalThis as any).__lastGenerateCall.args;
  assert(lastCall7.width === 512 && lastCall7.height === 512, 'Yui mode falls back to user dims when LLM silent');
  assert(lastCall7.prompt.includes('silent yui prompt'), 'Yui mode uses polished prompt even when silent');
  (globalThis as any).__providerSilent = false;

  // 8. admin gate
  const r8 = await handleTgCallback('qt:img:default', makeTc(12345));
  assert(r8?.text!.includes('admin only'), 'non-admin blocked from img callbacks');

  console.log('\n=== SELESAI ===');
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(err => {
  console.error('[TEST] Gagal:', err);
  process.exit(1);
});
