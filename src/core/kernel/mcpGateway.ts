/**
 * McpGateway — minimal MCP (Model Context Protocol) stdio client (#3).
 *
 * Spawns configured MCP servers (JSON-RPC over newline-delimited stdio),
 * lists their tools at boot, and registers each as a first-class YuiHime tool:
 * `mcp_<server>_<toolName>`. Calls are forwarded via tools/call.
 *
 * Config (modular settings, module id `mcp-bridge`):
 *   enabled: boolean (default false)
 *   serversJson: JSON array of { name, command, args[], env{} }
 *
 * Hand-rolled on purpose: no external dependency, stays bundle/pkg-friendly.
 */
import { SystemRegistry } from '@shared/core/registry';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { StorageService } from '@shared/drivers/storage';

interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpToolDef {
  name: string;
  description?: string;
  inputSchema?: any;
}

class McpServerClient {
  public tools: McpToolDef[] = [];
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending: Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; method: string }> = new Map();
  private buf = '';
  private nextId = 1;

  constructor(public config: McpServerConfig) {}

  async start(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const child = spawn(this.config.command, this.config.args || [], {
          env: { ...process.env, ...(this.config.env || {}) },
          stdio: ['pipe', 'pipe', 'pipe']
        });
        this.child = child;
        child.stdout.setEncoding('utf-8');
        child.stdout.on('data', (chunk: string) => this.onData(chunk));
        child.stderr.on('data', () => { /* ignore */ });
        child.on('error', (err: any) => {
          console.warn(`[MCP] Server '${this.config.name}' failed to start: ${err.message}`);
          resolve(false);
        });
        child.on('exit', () => {
          this.pending.forEach((p) => p.reject(new Error('MCP server exited')));
          this.pending.clear();
        });

        // Give the process a moment to boot, then handshake.
        setTimeout(async () => {
          try {
            await this.request('initialize', {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'yuihime', version: '1.0.0' }
            });
            this.notify('notifications/initialized', {});
            const res = await this.request('tools/list', {});
            this.tools = (res?.tools || []).map((t: any) => ({
              name: t.name,
              description: t.description || '',
              inputSchema: t.inputSchema || { type: 'object', properties: {} }
            }));
            console.log(`[MCP] Server '${this.config.name}' connected with ${this.tools.length} tools.`);
            resolve(true);
          } catch (err: any) {
            console.warn(`[MCP] Server '${this.config.name}' handshake failed: ${err.message}`);
            this.close();
            resolve(false);
          }
        }, 200);
      } catch (err: any) {
        console.warn(`[MCP] Server '${this.config.name}' spawn error: ${err.message}`);
        resolve(false);
      }
    });
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let idx: number;
    while ((idx = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, idx).trim();
      this.buf = this.buf.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) p.reject(new Error(msg.error.message || 'MCP error'));
          else p.resolve(msg.result);
        }
      } catch (_) {
        /* non-JSON noise from the server — ignore */
      }
    }
  }

  private request(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject, method });
      const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      this.child?.stdin.write(payload + '\n');
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request '${method}' timed out`));
        }
      }, 30000);
    });
  }

  private notify(method: string, params: any) {
    this.child?.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }

  async call(name: string, args: any): Promise<any> {
    const res = await this.request('tools/call', { name, arguments: args || {} });
    if (!res) return { success: true, result: '(no result)' };
    const content = res.content || [];
    const text = content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
    const structured = res.structuredContent;
    if (res.isError) {
      throw new Error(text || 'MCP tool error');
    }
    return { success: true, text, structuredContent: structured, raw: res };
  }

  close() {
    try {
      this.child?.kill();
    } catch (_) {}
    this.child = null;
  }
}

class McpGatewayClass {
  private static instance: McpGatewayClass;
  private clients: Map<string, McpServerClient> = new Map();
  private initialized = false;

  private constructor() {}

  public static getInstance(): McpGatewayClass {
    if (!McpGatewayClass.instance) {
      McpGatewayClass.instance = new McpGatewayClass();
    }
    return McpGatewayClass.instance;
  }

  async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const settings = (await StorageService.getModularSettings()) || {};
      const cfg = settings['mcp-bridge'] || {};
      if (cfg.enabled !== true) {
        console.log('[MCP] mcp-bridge disabled (config).');
        return;
      }
      let servers: McpServerConfig[] = [];
      try {
        servers = JSON.parse(cfg.serversJson || '[]');
      } catch (e) {
        console.warn('[MCP] serversJson invalid JSON:', e.message);
        return;
      }
      if (!Array.isArray(servers)) return;

      for (const s of servers) {
        if (!s?.name || !s?.command) continue;
        const client = new McpServerClient(s);
        const ok = await client.start();
        if (ok) {
          this.clients.set(s.name, client);
          this.registerTools(s.name, client);
        }
      }
      console.log(`[MCP] ${this.clients.size} MCP server(s) active.`);
    } catch (err: any) {
      console.warn('[MCP] init failed:', err.message);
    }
  }

  private registerTools(serverName: string, client: McpServerClient) {
    for (const tool of client.tools) {
      const id = `mcp_${serverName}_${tool.name}`;
      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
      try {
        SystemRegistry.register({
          metadata: {
            id: safeId,
            name: `MCP: ${serverName}/${tool.name}`,
            description: `MCP tool from server '${serverName}'. ${tool.description || ''}`,
            version: '1.0.0',
            type: 'TOOL',
            order: 95,
            parameters: tool.inputSchema || { type: 'object', properties: {} }
          },
          execute: async (args: any, context?: any) => {
            try {
              const result = await client.call(tool.name, args);
              return { success: true, ...result };
            } catch (err: any) {
              return { success: false, error: err.message || String(err) };
            }
          }
        });
        console.log(`[MCP] Registered tool: ${safeId}`);
      } catch (err: any) {
        console.warn(`[MCP] Failed registering tool ${safeId}: ${err.message}`);
      }
    }
  }

  shutdown() {
    this.clients.forEach((c) => c.close());
    this.clients.clear();
    this.initialized = false;
  }
}

export const McpGateway = McpGatewayClass.getInstance();
