import https from 'https';
import { Telegraf } from 'telegraf';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { OtomeGame, affectionLevel, petNameFor } from './engine.js';
import { yuiReaction, pickImageParams, llmAvailable } from './llm.js';
import { generateImages, getAccessKey, listTools, loadOtomeConfig } from './tensorart.js';

const SAVE_DIR = path.join(os.homedir(), '.yuihime', 'otome_saves');

function loadEnv(): void {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && !process.env[key]) process.env[key] = val;
  }
}

function meterText(affection: number): string {
  const filled = Math.round(affection / 10);
  return '❤'.repeat(filled) + '·'.repeat(10 - filled) + ` (${affection}/100)`;
}

function loadGame(userId: number): OtomeGame {
  const file = `tg_${userId}.json`;
  return OtomeGame.load(file) || new OtomeGame();
}

function renderScene(game: OtomeGame): { text: string; hasChoices: boolean } {
  const scene = game.currentScene();
  const level = affectionLevel(game.state.affection);
  const lines = [
    `📖 *Hari ke-${game.state.day}* • ${level.toUpperCase()} • panggilan: "${petNameFor(game.state.affection)}"`,
    `💗 Afeksi: ${meterText(game.state.affection)}`,
    ''
  ];
  if (game.state.finished) {
    lines.push(`*END: ${game.state.finished.toUpperCase()}*`);
    lines.push('');
  }
  lines.push(scene.text);
  return { text: lines.join('\n'), hasChoices: scene.choices.length > 0 };
}

function keyboardFor(game: OtomeGame): any[][] {
  const choices = game.availableChoices();
  const kb: any[][] = [];
  for (let i = 0; i < choices.length; i++) {
    const c = choices[i];
    let label = c.label;
    if (label.length > 60) label = label.slice(0, 59) + '…';
    if (c.locked) label = `🔒 ${label}`;
    else if (c.affection) label = `${label} [${c.affection > 0 ? '+' : ''}${c.affection}]`;
    kb.push([{ text: label, callback_data: `otome:${i}` }]);
  }
  return kb;
}

async function showGame(ctx: any, game: OtomeGame): Promise<void> {
  const { text, hasChoices } = renderScene(game);
  const opts: any = { parse_mode: 'Markdown' };
  if (hasChoices) opts.reply_markup = { inline_keyboard: keyboardFor(game) };
  try {
    await ctx.reply(text, opts);
  } catch {
    await ctx.reply(renderScene(game).text);
  }
}

function helpText(): string {
  return [
    '*YuiHime Otome — Telegram Bot (terisolasi)*',
    '',
    '/start — mulai / lanjut game',
    '/new — hari baru (setelah ending)',
    '/status — afeksi & status',
    '/foto <deskripsi> — generate gambar Yui (TensorArt)',
    '/help — bantuan ini',
    '',
    'Pilih opsi lewat tombol di bawah pesan.',
    'Note: bot ini hanya melayani owner.'
  ].join('\n');
}

async function main(): Promise<void> {
  loadEnv();
  const cfg = loadOtomeConfig();
  if (!cfg.botToken) {
    console.error('[OTOME-TG] Bot token tidak ada. Isi ~/.yuihime/otome_tg_config.json (botToken) atau env YUIHIME_OTOME_TG_TOKEN.');
    process.exit(1);
  }
  if (!cfg.ownerId) {
    console.error('[OTOME-TG] ownerId tidak ada di ~/.yuihime/otome_tg_config.json.');
    process.exit(1);
  }

  const llmOn = process.env.YUIHIME_OTOME_LLM === '0' ? false : llmAvailable();
  const tensorKey = await getAccessKey();
  console.log(`[OTOME-TG] LLM: ${llmOn ? 'AKTIF' : 'mati'}. TensorArt key: ${tensorKey ? 'ada' : 'TIDAK ADA (foto dinonaktifkan)'}`);

  const ipv4Agent = new https.Agent({ family: 4, keepAlive: true, keepAliveMsecs: 10000 });
  const bot = new Telegraf(cfg.botToken, { telegram: { agent: ipv4Agent } } as any);
  (globalThis as any).activeTelegramBot = bot;

  const isOwner = (ctx: any): boolean => {
    const id = Number(ctx.from?.id);
    return id === Number(cfg.ownerId);
  };

  bot.use((ctx, next) => {
    if (!isOwner(ctx)) {
      return ctx.reply('🔒 Bot ini khusus owner Yui~').catch(() => {});
    }
    return next();
  });

  bot.command('start', (ctx) => {
    const game = loadGame(ctx.from.id);
    return showGame(ctx, game);
  });

  bot.command('new', (ctx) => {
    const game = loadGame(ctx.from.id);
    game.newDay();
    game.save(`tg_${ctx.from.id}.json`);
    return showGame(ctx, game);
  });

  bot.command('status', (ctx) => {
    const game = loadGame(ctx.from.id);
    return ctx.reply(renderScene(game).text, { parse_mode: 'Markdown' });
  });

  bot.command('help', (ctx) => ctx.reply(helpText(), { parse_mode: 'Markdown' }));

  bot.command('foto', async (ctx) => {
    const prompt = (ctx.message.text || '').replace(/^\/\w+@?\w*\s*/, '').trim();
    if (!prompt) {
      return ctx.reply('Contoh: /foto Yui berdiri di taman bunga sakura, senyum, anime style, 1girl, high quality');
    }
    if (!tensorKey) {
      return ctx.reply('⚠️ TensorArt API key belum diatur. Isi tensorartApiKey di ~/.yuihime/otome_tg_config.json atau salin key ke ~/.yuihime/tensor_access_key lalu restart bot.');
    }
    const statusMsg = await ctx.reply('✨ Yui lagi bikin foto... sebentar ya~');

    let params: { toolName: string; width: number; height: number; prompt: string };
    try {
      const models = await listTools(tensorKey, 8000).then(ts => {
        const names = new Set<string>();
        for (const t of ts) {
          const n = String(t?.name || t?.tool_id || t?.toolId || '').trim();
          if (n && n.length < 60) names.add(n);
        }
        return Array.from(names);
      });
      const picked = llmOn ? await pickImageParams(prompt, models) : null;
      params = picked || { toolName: cfg.defaultModel || 'anime_lab_wai_illustrious', width: 1024, height: 1024, prompt };
    } catch {
      params = { toolName: cfg.defaultModel || 'anime_lab_wai_illustrious', width: 1024, height: 1024, prompt };
    }

    const result = await generateImages({
      prompt: params.prompt,
      toolName: params.toolName,
      width: params.width,
      height: params.height,
      count: 1,
      onProgress: (msg) => ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `✨ ${msg}`).catch(() => {})
    });

    if (result.status !== 'success' || result.imageUrls.length === 0) {
      await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ Gagal: ${result.error || 'unknown'}`).catch(() => {});
      return;
    }

    await ctx.telegram.deleteMessage(ctx.chat.id, statusMsg.message_id).catch(() => {});
    for (let i = 0; i < result.imageUrls.length; i++) {
      const caption = result.localPaths[i] ? `Foto ${i + 1}/${result.imageUrls.length} dari Yui~ 💖` : 'Foto selesai! (link saja)';
      const src = result.localPaths[i] ? { source: fs.createReadStream(result.localPaths[i] as string) } : { url: result.imageUrls[i] };
      try {
        await ctx.replyWithPhoto(src, { caption, parse_mode: 'Markdown' });
      } catch {
        await ctx.reply(`Foto: ${result.imageUrls[i]}`);
      }
    }
  });

  bot.action(/^otome:(\d+)$/, async (ctx) => {
    try {
      const idx = Number(ctx.match[1]);
      const game = loadGame(ctx.from.id);
      const available = game.availableChoices();
      if (idx < 0 || idx >= available.length) {
        await ctx.answerCbQuery('Opsi tidak tersedia.');
        return;
      }
      if (available[idx].locked) {
        await ctx.answerCbQuery('Terkunci — butuh afeksi lebih.');
        return;
      }

      const { scene, delta, ending } = game.choose(idx);
      game.save(`tg_${ctx.from.id}.json`);
      await ctx.answerCbQuery();

      if (ending) {
        const parts = [`*END: ${ending.toUpperCase()}*`, '', scene.text, '', `💗 Afeksi akhir: ${meterText(game.state.affection)}`];
        if (ending === 'love') {
          parts.push('', '💞 Kakak jadi pacar Yui! Ketik /new untuk lanjut sebagai pasangan (jalur malam intim di "Malam romantis").');
        } else {
          parts.push('', 'Ketik /new untuk hari baru.');
        }
        await ctx.editMessageText(parts.join('\n'), { parse_mode: 'Markdown' }).catch(async () => {
          await ctx.reply(parts.join('\n'), { parse_mode: 'Markdown' });
        });
        return;
      }

      let reaction = '';
      if (llmOn) {
        const r = await yuiReaction({
          sceneText: scene.text,
          choiceLabel: game.state.lastChoice || '',
          affection: game.state.affection,
          affectionLevel: affectionLevel(game.state.affection),
          petName: petNameFor(game.state.affection),
          flags: game.state.flags
        });
        if (r) reaction = `_— Yui (live) —_\n${r}\n\n`;
      }

      const next = renderScene(game);
      const full = `${reaction}${next.text}`;
      const opts: any = { parse_mode: 'Markdown' };
      if (next.hasChoices) opts.reply_markup = { inline_keyboard: keyboardFor(game) };
      await ctx.editMessageText(full, opts).catch(async () => {
        const { text } = renderScene(game);
        await ctx.reply(text, opts);
      });
    } catch (e: any) {
      console.error('[OTOME-TG] action error:', e?.message || e);
      await ctx.answerCbQuery('Terjadi error.').catch(() => {});
    }
  });

  bot.catch((err: any) => console.error('[OTOME-TG] bot error:', err?.message || err));

  const stop = () => {
    console.log('[OTOME-TG] Shutting down...');
    bot.stop('SIGINT');
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  bot.launch().catch((e) => {
    console.error('[OTOME-TG] Launch gagal:', e?.message || e);
    process.exit(1);
  });
  console.log('[OTOME-TG] Bot berjalan (polling).');
}

main().catch((e) => {
  console.error('[OTOME-TG] Fatal:', e?.message || e);
  process.exit(1);
});
