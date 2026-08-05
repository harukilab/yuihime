import { ToolModule } from '@shared/include/types';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const manifest = {
  id: 'diagnostics',
  name: 'Diagnostics (LSP-lite)',
  description: 'Run the project linter/type-checker (TypeScript via tsc --noEmit, ESLint via --format json, or Python via py_compile) in a directory and return structured diagnostics. Use this to surface compiler/linter errors as tool observations before fixing code — the model can then act on them directly.',
  version: '1.0.0',
  type: 'TOOL',
  order: 88,
  parameters: {
    type: 'object',
    properties: {
      dir: {
        type: 'string',
        description: 'Directory to run diagnostics in (project root). Defaults to process cwd.'
      },
      language: {
        type: 'string',
        enum: ['ts', 'eslint', 'python', 'auto'],
        description: 'Diagnostic engine. ts = tsc --noEmit, eslint = eslint --format json, python = py_compile. auto = infer from dir contents.'
      },
      timeoutMs: {
        type: 'number',
        description: 'Max runtime in ms (default 60000).'
      }
    },
    required: ['language']
  }
} as const;

interface DiagArgs {
  dir?: string;
  language?: string;
  timeoutMs?: number;
}

interface Diagnostic {
  file?: string;
  line?: number;
  column?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

function parseTscOutput(raw: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  const re = /^(.*?)\((\d+),(\d+)\):\s+(error|warning|info)\s+(TS\d+)?\s*:\s*(.*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    out.push({
      file: m[1].trim(),
      line: Number(m[2]),
      column: Number(m[3]),
      severity: (m[4] as any) || 'error',
      message: `${m[5] ? m[5] + ' ' : ''}${m[6].trim()}`
    });
  }
  return out;
}

function runCmd(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({
        code: err ? ((err as any).code ?? 1) : 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || '')
      });
    });
  });
}

function inferLanguage(dir: string): string {
  if (fs.existsSync(path.join(dir, 'tsconfig.json'))) return 'ts';
  if (fs.existsSync(path.join(dir, '.eslintrc.js')) ||
      fs.existsSync(path.join(dir, '.eslintrc.cjs')) ||
      fs.existsSync(path.join(dir, '.eslintrc.json')) ||
      fs.existsSync(path.join(dir, '.eslintrc.yml')) ||
      fs.existsSync(path.join(dir, 'eslint.config.js'))) return 'eslint';
  if (fs.existsSync(path.join(dir, 'pyproject.toml')) || fs.existsSync(path.join(dir, 'requirements.txt'))) return 'python';
  return 'ts';
}

export const DiagnosticsTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: DiagArgs, context?: any) => {
    const dir = path.resolve(args.dir || context?.cwd || process.cwd());
    const timeoutMs = Math.min(Math.max(Number(args.timeoutMs) || 60000, 5000), 180000);
    const language = args.language === 'auto' ? inferLanguage(dir) : (args.language || 'auto');

    try {
      if (language === 'ts') {
        const localTsc = path.join(dir, 'node_modules', '.bin', 'tsc');
        const res = await runCmd(localTsc, ['--noEmit', '--pretty', 'false'], dir, timeoutMs);
        const diags = parseTscOutput(res.stdout + '\n' + res.stderr);
        return {
          success: true,
          language,
          dir,
          exitCode: res.code,
          errorCount: diags.filter(d => d.severity === 'error').length,
          diagnostics: diags.slice(0, 60),
          raw: res.code === 0 ? 'No TypeScript errors found.' : `${diags.length} diagnostic(s) found.`
        };
      }

      if (language === 'eslint') {
        const res = await runCmd('npx', ['eslint', '.', '--format', 'json'], dir, timeoutMs);
        let parsed: any[] = [];
        try {
          parsed = JSON.parse(res.stdout);
        } catch (_) {
          return { success: false, language, dir, error: 'ESLint JSON output unparseable: ' + res.stdout.slice(0, 300) };
        }
        const diags: Diagnostic[] = [];
        for (const fileResult of parsed) {
          for (const msg of fileResult.messages || []) {
            diags.push({
              file: fileResult.filePath,
              line: msg.line,
              column: msg.column,
              severity: msg.severity === 2 ? 'error' : msg.severity === 1 ? 'warning' : 'info',
              message: msg.message + (msg.ruleId ? ` (${msg.ruleId})` : '')
            });
          }
        }
        return {
          success: true,
          language,
          dir,
          errorCount: diags.filter(d => d.severity === 'error').length,
          diagnostics: diags.slice(0, 60),
          raw: diags.length === 0 ? 'No ESLint problems found.' : `${diags.length} lint issue(s) found.`
        };
      }

      if (language === 'python') {
        const pyFiles = fs.readdirSync(dir).filter((f: string) => f.endsWith('.py'));
        const diags: Diagnostic[] = [];
        for (const f of pyFiles.slice(0, 20)) {
          const res = await runCmd('python3', ['-m', 'py_compile', f], dir, timeoutMs);
          if (res.code !== 0) {
            diags.push({ file: f, severity: 'error', message: res.stderr.split('\n').filter(Boolean).slice(0, 3).join(' | ') });
          }
        }
        return {
          success: true,
          language,
          dir,
          errorCount: diags.length,
          diagnostics: diags.slice(0, 60),
          raw: diags.length === 0 ? 'No Python syntax errors found.' : `${diags.length} Python file(s) with errors.`
        };
      }

      return { success: false, language, dir, error: `Unsupported language: ${language}` };
    } catch (err: any) {
      return { success: false, language, dir, error: err.message || String(err) };
    }
  }
};
