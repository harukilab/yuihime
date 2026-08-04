import { ToolModule } from '@shared/include/types';

const manifest = {
  "id": "calculator",
  "name": "Calculator",
  "description": "Safely evaluate a mathematical expression (e.g., '2 * (3 + 4)', 'sqrt(144)', '12% of 250'). Use for arithmetic, percentages, rounding, or any numerical computation the user requests.",
  "version": "1.0.0",
  "type": "TOOL",
  "order": 96,
  "parameters": {
    "type": "object",
    "properties": {
      "expression": {
        "type": "string",
        "description": "The math expression to evaluate. Supports + - * / % ^ and parentheses. Functions: sqrt, abs, pow, log, ln, sin, cos, tan, floor, ceil, round, min, max. Constants: pi, e."
      }
    },
    "required": ["expression"]
  }
} as const;

const FUNCTIONS: Record<string, (...a: number[]) => number> = {
  sqrt: (a) => Math.sqrt(a),
  abs: (a) => Math.abs(a),
  pow: (a, b) => Math.pow(a, b),
  log: (a) => Math.log10(a),
  ln: (a) => Math.log(a),
  sin: (a) => Math.sin(a),
  cos: (a) => Math.cos(a),
  tan: (a) => Math.tan(a),
  floor: (a) => Math.floor(a),
  ceil: (a) => Math.ceil(a),
  round: (a) => Math.round(a),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a)
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E
};

type Token = { type: 'num' | 'op' | 'lparen' | 'rparen' | 'func' | 'const' | 'comma'; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (c >= '0' && c <= '9' || c === '.') {
      let num = '';
      while (i < input.length && ((input[i] >= '0' && input[i] <= '9') || input[i] === '.')) num += input[i++];
      tokens.push({ type: 'num', value: num });
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let name = '';
      while (i < input.length && /[a-zA-Z_]/.test(input[i])) name += input[i++];
      name = name.toLowerCase();
      if (name in CONSTANTS) tokens.push({ type: 'const', value: name });
      else if (name in FUNCTIONS) tokens.push({ type: 'func', value: name });
      else throw new Error(`Unknown identifier: ${name}`);
      continue;
    }
    if ('+-*/%^'.includes(c)) { tokens.push({ type: 'op', value: c }); i++; continue; }
    if (c === '(') { tokens.push({ type: 'lparen', value: c }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rparen', value: c }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma', value: c }); i++; continue; }
    throw new Error(`Unexpected character: ${c}`);
  }
  return tokens;
}

function evaluate(tokens: Token[]): number {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpression(): number {
    let left = parseTerm();
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = next().value;
      const right = parseFactor();
      if (op === '*') left *= right;
      else if (op === '/') {
        if (right === 0) throw new Error('Division by zero');
        left /= right;
      } else left %= right;
    }
    return left;
  }

  function parseFactor(): number {
    let base = parseBase();
    if (peek() && peek().type === 'op' && peek().value === '^') {
      next();
      const exp = parseFactor();
      base = Math.pow(base, exp);
    }
    return base;
  }

  function parseBase(): number {
    if (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const sign = next().value;
      const val = parseBase();
      return sign === '-' ? -val : val;
    }
    const t = peek();
    if (!t) throw new Error('Unexpected end of expression');
    if (t.type === 'num') { next(); return parseFloat(t.value); }
    if (t.type === 'const') { next(); return CONSTANTS[t.value]; }
    if (t.type === 'func') {
      next();
      if (!peek() || peek().type !== 'lparen') throw new Error(`Expected '(' after function ${t.value}`);
      next();
      const args: number[] = [];
      args.push(parseExpression());
      while (peek() && peek().type === 'comma') { next(); args.push(parseExpression()); }
      if (!peek() || peek().type !== 'rparen') throw new Error(`Expected ')' for function ${t.value}`);
      next();
      return FUNCTIONS[t.value](...args);
    }
    if (t.type === 'lparen') {
      next();
      const val = parseExpression();
      if (!peek() || peek().type !== 'rparen') throw new Error("Expected ')'");
      next();
      return val;
    }
    throw new Error(`Unexpected token: ${t.value}`);
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error('Unexpected trailing input');
  return result;
}

export const CalculatorTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    try {
      const expr = args && args.expression ? String(args.expression) : '';
      if (!expr.trim()) return { success: false, error: 'Expression is required' };
      const tokens = tokenize(expr);
      if (tokens.length === 0) return { success: false, error: 'Empty expression' };
      const value = evaluate(tokens);
      if (!Number.isFinite(value)) return { success: false, error: 'Result is not a finite number' };
      return {
        success: true,
        expression: expr,
        result: value,
        formatted: Number.isInteger(value) ? String(value) : value.toFixed(6).replace(/\.?0+$/, '')
      };
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }
};
