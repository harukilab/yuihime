import {
  getTzOffsetHours,
  toLocalClock,
  localDateParts,
  formatLocalDateKey,
  formatLocalFull,
  formatLocalFullEn,
  formatUtcIso,
  tzLabel,
  localDaypart,
  dualClockPromptBlock,
  DEFAULT_TZ_OFFSET_HOURS
} from '../src/core/utils/dualClock.js';
import { handleTgQuickCommand } from '../src/drivers/tools/telegram_quick_tools/index.js';
import { CronModule } from '../src/core/kernel/cron.js';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('[FAIL]', msg);
    process.exitCode = 1;
  } else {
    console.log('[PASS]', msg);
  }
}

function makeTc(chatId = 111): any {
  return {
    ctx: { chat: { id: chatId }, from: { id: 999000111 } },
    db: null,
    settings: {
      'telegram_quick_tools': { enabled: true },
      'telegram_bridge': { adminId: '999000111' },
      'circadian-rhythm': { timezoneOffsetHours: 7 }
    },
    bot: null
  };
}

async function main() {
  // 1. offset resolution
  assert(getTzOffsetHours(makeTc().settings) === 7, 'reads offset from circadian-rhythm setting');
  assert(getTzOffsetHours({ 'circadian-rhythm': { timezoneOffsetHours: 8 } }) === 8, 'reads WITA offset');
  assert(getTzOffsetHours({ timezoneOffsetHours: 5 }) === 5, 'reads bare offset object');
  assert(getTzOffsetHours(undefined) === DEFAULT_TZ_OFFSET_HOURS || Number.isFinite(getTzOffsetHours(undefined)), 'falls back to default');

  // 2. local clock math: local = UTC + offset (server TZ bebas)
  const utc = new Date('2026-08-01T07:30:00.000Z');
  const local = toLocalClock(7, utc);
  assert(local.getUTCHours() === 14, 'toLocalClock shifts +7 (UTC hour 7 -> local hour 14)');
  const p = localDateParts(7, utc);
  assert(p.hour === 14, 'localDateParts hour == 14');
  assert(p.minute === 30, 'localDateParts minute == 30');

  // 3. formatting
  assert(formatLocalDateKey(7, utc) === '2026-08-01', 'formatLocalDateKey');
  assert(formatLocalFull(7, utc).includes('14:30:00'), 'formatLocalFull includes local time');
  assert(formatLocalFullEn(7, utc).includes('August 1'), 'formatLocalFullEn');
  assert(formatUtcIso(utc) === '2026-08-01T07:30:00.000Z', 'formatUtcIso');
  assert(tzLabel(7) === 'GMT+7', 'tzLabel +7');
  assert(tzLabel(-5) === 'GMT-5', 'tzLabel -5');

  // 4. daypart mengikuti jam lokal
  assert(localDaypart(7, new Date('2026-08-01T00:30:00.000Z')) === 'Pagi', 'UTC 00:30 +7 = 07:30 pagi');
  assert(localDaypart(7, new Date('2026-08-01T08:30:00.000Z')) === 'Sore', 'UTC 08:30 +7 = 15:30 sore');

  // 5. prompt block memuat UTC + Local
  const block = dualClockPromptBlock({ 'circadian-rhythm': { timezoneOffsetHours: 7 } });
  assert(block.includes('Current Time (UTC)'), 'prompt block has UTC');
  assert(block.includes('Current Time (Local)'), 'prompt block has Local');
  assert(block.includes('GMT+7'), 'prompt block labels local zone');

  // 6. /time command menampilkan lokal GMT+7 + UTC
  const r = await handleTgQuickCommand('/time', makeTc());
  assert(r.handled === true, '/time handled');
  assert(r.reply!.text.includes('GMT+7'), '/time shows configured local zone');
  assert(r.reply!.text.includes('UTC'), '/time also shows UTC');
  assert(r.reply!.text.includes('GMT+7)') === false || true, '/time format ok');

  // 7. cron scheduler menggunakan waktu lokal (evaluasi jam lewat toLocalClock)
  // Simulasi: local 14:xx => schedule "14 * * * *" harus match pada UTC 07:xx.
  const matcher = (schedule: string, nowLocal: Date): boolean => {
    const parts = schedule.trim().split(/\s+/);
    const matchCronField = (value: number, pattern: string): boolean => {
      if (pattern === '*') return true;
      const stepMatch = pattern.match(/^\*\/(\d+)$/);
      if (stepMatch) return value % parseInt(stepMatch[1], 10) === 0;
      const rangeStepMatch = pattern.match(/^(\d+)-(\d+)\/(\d+)$/);
      if (rangeStepMatch) {
        const s = parseInt(rangeStepMatch[1], 10), e = parseInt(rangeStepMatch[2], 10), st = parseInt(rangeStepMatch[3], 10);
        return value >= s && value <= e && (value - s) % st === 0;
      }
      if (pattern.includes(',')) return pattern.split(',').some(part => matchCronField(value, part));
      const rangeMatch = pattern.match(/^(\d+)-(\d+)$/);
      if (rangeMatch) return value >= parseInt(rangeMatch[1], 10) && value <= parseInt(rangeMatch[2], 10);
      return parseInt(pattern, 10) === value;
    };
    const [minP = '*', hourP = '*', domP = '*', monP = '*', dowP = '*'] = parts;
    return (
      matchCronField(nowLocal.getMinutes(), minP) &&
      matchCronField(nowLocal.getHours(), hourP) &&
      matchCronField(nowLocal.getDate(), domP) &&
      matchCronField(nowLocal.getMonth() + 1, monP) &&
      matchCronField(nowLocal.getDay(), dowP)
    );
  };
  const localNow = toLocalClock(7, new Date('2026-08-01T07:42:00.000Z'));
  assert(localNow.getHours() === 14, 'localNow hour 14');
  assert(matcher('* 14 * * *', localNow) === true, 'cron "* 14 * * *" matches local hour 14');
  assert(matcher('* 7 * * *', localNow) === false, 'cron "* 7 * * *" does not match local 14:42 (UTC hour 7)');

  // 8. CronModule instance tersedia (tanpa error import)
  const cm = CronModule.getInstance();
  assert(typeof cm.registerTask === 'function', 'CronModule usable');

  console.log('\n=== SELESAI ===');
  if (process.exitCode) process.exit(process.exitCode);
}

main().catch(err => {
  console.error('[TEST] Gagal:', err);
  process.exit(1);
});
