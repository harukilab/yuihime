import { WebSocket } from 'ws';
import { SettingsManager } from '../kernel/settings.js';
import { SystemRegistry } from '../registry.js';
import { ModuleType, ToolModule } from '../../include/types.js';

let activeMCPWs: WebSocket | null = null;
let reconnectInterval: any = null;

export async function initializeMCP(force = false) {
  const settings = SettingsManager.getInstance().getAll();
  const mcpConfig = settings['mcp_servers'] || {};
  const mcpEnabled = mcpConfig.enabled === true;
  const serverUrl = mcpConfig.serverUrl || '';
  const serverLabel = mcpConfig.serverLabel || 'MCP Server';

  // If MCP is disabled, close existing connection if any and return
  if (!mcpEnabled) {
    if (activeMCPWs) {
      console.log('[MCP] MCP is disabled. Closing existing MCP WebSocket connection...');
      try {
        activeMCPWs.close();
      } catch (e) {}
      activeMCPWs = null;
    }
    console.log('[MCP] MCP integration is disabled by setting. Daemon is inactive.');
    return;
  }

  // If there's an existing ws, close it if configuration changed
  if (activeMCPWs) {
    if (force || activeMCPWs.url !== serverUrl) {
      console.log('[MCP] Closing existing MCP WebSocket connection...');
      try {
        activeMCPWs.close();
      } catch (e) {}
      activeMCPWs = null;
    } else {
      // Already running
      return;
    }
  }

  if (!serverUrl) {
    console.log('[MCP] MCP Server URL is empty. Daemon is inactive.');
    return;
  }

  console.log(`[MCP] Connecting to MCP Server JSON-RPC WebSocket at: ${serverUrl}`);

  try {
    const ws = new WebSocket(serverUrl);
    activeMCPWs = ws;

    let idCounter = 1;
    const pendingRequests = new Map<number, { resolve: (res: any) => void; reject: (err: any) => void }>();

    ws.on('open', () => {
      console.log(`[MCP] WebSocket connected to ${serverLabel}. Listing tools...`);
      
      // Call tools/list to fetch dynamic tools
      const request = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: idCounter++
      };

      ws.send(JSON.stringify(request));
    });

    ws.on('message', (data: any) => {
      try {
        const response = JSON.parse(data.toString());
        
        // Match pending request resolves (handling tools/call output)
        if (response.id !== undefined && pendingRequests.has(response.id)) {
          const { resolve } = pendingRequests.get(response.id)!;
          pendingRequests.delete(response.id);
          resolve(response);
          return;
        }

        // Handle raw tools/list response
        if (response.result && response.result.tools) {
          const mcpTools = response.result.tools;
          console.log(`[MCP] Discovered ${mcpTools.length} dynamic tools from MCP Server.`);
          
          for (const tool of mcpTools) {
            const registeredTool: ToolModule = {
              metadata: {
                id: `mcp-${tool.name}`,
                name: `mcp-${tool.name}`,
                description: `[MCP: ${serverLabel}] ${tool.description || 'Dynamic MCP Tool Integration.'}`,
                version: '1.0.0',
                type: ModuleType.TOOL,
                order: 300,
                parameters: tool.inputSchema || { type: 'object', properties: {} }
              } as any,
              execute: async (args: any) => {
                console.log(`[MCP] Executing dynamic MCP tool call: ${tool.name} with args:`, args);
                
                if (!activeMCPWs || activeMCPWs.readyState !== WebSocket.OPEN) {
                  throw new Error(`MCP WebSocket connection to ${serverLabel} is not currently open.`);
                }

                const currentSocket = activeMCPWs;

                return new Promise((resolve, reject) => {
                  const reqId = idCounter++;
                  const cmdPayload = {
                    jsonrpc: '2.0',
                    method: 'tools/call',
                    params: {
                      name: tool.name,
                      arguments: args
                    },
                    id: reqId
                  };

                  pendingRequests.set(reqId, {
                    resolve: (res) => {
                      if (res.error) {
                        reject(new Error(res.error.message || `MCP invocation failed.`));
                      } else {
                        resolve(res.result?.content || res.result || res);
                      }
                    },
                    reject
                  });

                  currentSocket.send(JSON.stringify(cmdPayload));
                  
                  // Timeout after 30 seconds
                  setTimeout(() => {
                    if (pendingRequests.has(reqId)) {
                      pendingRequests.delete(reqId);
                      reject(new Error(`MCP execution timeout (30s limit reached).`));
                    }
                  }, 30000);
                });
              }
            };

            SystemRegistry.register(registeredTool);
            console.log(`[MCP] Dynamically registered tool: mcp-${tool.name}`);
          }
        }
      } catch (e: any) {
        console.warn('[MCP] Error processing WebSocket frame:', e.message || e);
      }
    });

    ws.on('close', () => {
      console.warn(`[MCP] Connection to MCP at ${serverUrl} closed. Reconnecting in 60s...`);
      activeMCPWs = null;
      if (reconnectInterval) clearTimeout(reconnectInterval);
      reconnectInterval = setTimeout(() => initializeMCP(true), 60000);
    });

    ws.on('error', (err: any) => {
      const errMsg = err.message || String(err);
      if (errMsg.includes('ECONNREFUSED')) {
        console.warn(`[MCP] Optional local MCP daemon offline at ${serverUrl} (ECONNREFUSED). Retrying in 60s...`);
      } else {
        console.warn(`[MCP] WebSocket Connection Notification:`, errMsg);
      }
    });
  } catch (err: any) {
    const errMsg = err.message || String(err);
    console.warn(`[MCP] Failed to establish connect to MCP URL: ${serverUrl} (Offline).`);
  }
}
