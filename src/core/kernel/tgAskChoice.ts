// tgAskChoice.ts — lets Yui (the agent) ask the user an interactive question
// in Telegram with inline choice buttons and wait for the answer.
//
// Flow:
//   1. Tool ask_choice -> askTelegramChoice(bot, chatId, question, options, timeoutMs)
//      sends a message with inline keyboard `qt:ask:<token>:<index>` and awaits.
//   2. Telegram callback_query handler sees `qt:ask:` -> resolveAskCallback(...)
//      resolves the pending promise with the chosen label.
//   3. ask_choice returns the answer to the LLM so it can continue.

interface PendingAsk {
  resolve: (result: AskChoiceResult) => void;
  timer: NodeJS.Timeout;
  question: string;
  options: string[];
}

export interface AskChoiceResult {
  chosen: boolean;
  index: number;
  label: string;
  timedOut: boolean;
  canceled: boolean;
}

const pendingAsks = new Map<string, PendingAsk>();

function createAskToken(): string {
  return `ask_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function askTelegramChoice(
  bot: any,
  chatId: number | string,
  question: string,
  options: string[],
  timeoutMs = 120000
): Promise<AskChoiceResult> {
  const token = createAskToken();
  const opts = options.slice(0, 6);
  const inline: any[][] = opts.map((label, i) => [
    { text: String(label).slice(0, 32), callback_data: `qt:ask:${token}:${i}` }
  ]);
  inline.push([{ text: '✖️ Batal', callback_data: `qt:ask:${token}:cancel` }]);

  const sent = await bot.telegram.sendMessage(chatId, `🧐 ${question}`, {
    reply_markup: { inline_keyboard: inline }
  });
  const messageId = sent?.message_id;

  return new Promise<AskChoiceResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingAsks.delete(token);
      resolve({ chosen: false, index: -1, label: '', timedOut: true, canceled: false });
      if (messageId != null) {
        bot.telegram
          .editMessageText(chatId, messageId, undefined, `⏱️ Timeout — no answer for:\n\n${question}`, {
            reply_markup: { inline_keyboard: [] }
          })
          .catch(() => {});
      }
    }, timeoutMs);
    pendingAsks.set(token, { resolve, timer, question, options: opts });
  });
}

export function resolveAskCallback(
  data: string,
  editMessage: (text: string, keyboardEmpty?: boolean) => Promise<void>
): boolean {
  const m = String(data).match(/^qt:ask:([A-Za-z0-9_]+):(cancel|\d+)$/);
  if (!m) return false;
  const token = m[1];
  const pick = m[2];
  const pending = pendingAsks.get(token);
  if (!pending) {
    editMessage('⏳ This choice has expired / is no longer active.').catch(() => {});
    return true;
  }
  clearTimeout(pending.timer);
  pendingAsks.delete(token);

  if (pick === 'cancel') {
    pending.resolve({ chosen: false, index: -1, label: '', timedOut: false, canceled: true });
    editMessage(`✖️ Dibatal.\n\n${pending.question}`, true).catch(() => {});
    return true;
  }
  const idx = Number(pick);
  const label = pending.options[idx] || '';
  pending.resolve({ chosen: true, index: idx, label, timedOut: false, canceled: false });
  editMessage(`✅ ${label}\n\n${pending.question}`, true).catch(() => {});
  return true;
}

export function getPendingAskCount(): number {
  return pendingAsks.size;
}
