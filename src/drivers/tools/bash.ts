import { ToolModule } from '@shared/include/types';

const manifest = {
  id: 'bash',
  name: 'Bash',
  description: 'Execute one shell command string with the host user\'s filesystem, process, and network authority. Returns structured output with stdout, stderr, exit code, and timeout/truncation status.',
  version: '1.0.0',
  type: 'TOOL',
  order: 100,
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command string to execute (e.g. "ls -la", "cat file.txt", "bash script.sh")'
      },
      workdir: {
        type: 'string',
        description: 'Working directory. Defaults to the active Location; relative paths resolve from that Location.'
      },
      timeout: {
        type: 'number',
        description: 'Timeout in milliseconds. Defaults to shellTimeoutMs config or 120000ms. Max 600000ms.'
      },
      description: {
        type: 'string',
        description: 'Concise description of the command\'s purpose'
      }
    },
    required: ['command']
  }
} as const;

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

function compactOutput(stdout: string, stderr: string): string {
  if (stdout && stderr) return `${stdout}\n\nstderr:\n${stderr}`;
  if (stderr) return `stderr:\n${stderr}`;
  return stdout || '(no output)';
}

function modelOutput(obs: any): string {
  const warnings = obs.warnings?.length
    ? `\n\nWarnings:\n${obs.warnings.map((w: string) => `- ${w}`).join('\n')}`
    : '';
  const body = obs.output + warnings;
  if (obs.timedOut) return `${body}\n\nCommand timed out before completion.`;
  return `${body}\n\nCommand exited with code ${obs.exitCode ?? 0}.`;
}

export const BashTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    const isServer = typeof window === 'undefined';
    const baseUrl = isServer
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : `${window.location.origin}`;

    let timeout = Number(args.timeout) || DEFAULT_TIMEOUT_MS;
    if (timeout > MAX_TIMEOUT_MS) timeout = MAX_TIMEOUT_MS;

    const res = await fetch(`${baseUrl}/api/tools/shell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: args.command,
        workdir: args.workdir,
        timeout,
        description: args.description
      })
    });

    const body = await res.json();

    const stdout = String(body.stdout || '');
    const stderr = String(body.stderr || '');
    const output = compactOutput(stdout.trim(), stderr.trim());
    const truncated = body.truncated || false;
    const stdoutTruncated = !!body.stdoutTruncated;
    const stderrTruncated = !!body.stderrTruncated;
    const exitCode = body.exitCode ?? (body.error ? 1 : 0);

    return {
      command: args.command,
      cwd: body.cwd || '',
      exitCode,
      output: truncated ? `${output}\n\n[Output capture truncated at the in-memory safety limit]` : (output || '(no output)'),
      truncated,
      ...(stdoutTruncated ? { stdoutTruncated: true } : {}),
      ...(stderrTruncated ? { stderrTruncated: true } : {}),
      ...(body.timedOut ? { timedOut: true } : {}),
      ...(body.warnings?.length ? { warnings: body.warnings } : {}),
      ...(body.error && !body.timedOut ? { error: body.error } : {}),
      ...(stderr.trim() ? { stderr: stderr.trim() } : {})
    };
  }
};
