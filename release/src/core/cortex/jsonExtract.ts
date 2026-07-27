export function extractBestJsonObject(text: string): string | null {
  const len = text.length;
  let inStr = false;
  let escaped = false;
  const closeStack: string[] = [];
  const openStack: number[] = [];
  const candidates: { start: number; end: number; json: string }[] = [];

  for (let i = 0; i < len; i++) {
    const c = text[i];

    if (inStr) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === '"') {
        inStr = false;
      }
      continue;
    }

    if (c === '"') {
      inStr = true;
      continue;
    }

    if (c === '{' || c === '[') {
      closeStack.push(c === '{' ? '}' : ']');
      openStack.push(i);
    } else if (c === '}' || c === ']') {
      if (closeStack.length > 0 && closeStack[closeStack.length - 1] === c) {
        closeStack.pop();
        const start = openStack.pop()!;
        if (c === '}') {
          const candidate = text.substring(start, i + 1);
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              candidates.push({ start, end: i, json: candidate });
            }
          } catch (_) {}
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  const validKeys = ['thought', 'speech', 'final_answer', 'tool_calls', 'animations', 'mood_impact'];

  for (let i = candidates.length - 1; i >= 0; i--) {
    const parsed = JSON.parse(candidates[i].json);
    const keys = Object.keys(parsed);
    if (keys.some(k => validKeys.includes(k))) {
      return candidates[i].json;
    }
  }

  for (let i = 0; i < candidates.length; i++) {
    return candidates[i].json;
  }

  return null;
}
