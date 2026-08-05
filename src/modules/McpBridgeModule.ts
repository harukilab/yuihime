import { CortexModule, ModuleType } from '@shared/include/types';

/**
 * MCP Bridge Module — config surface for the MCP (Model Context Protocol)
 * client. When `enabled` and `serversJson` are set, McpGateway spawns the
 * servers at boot and registers their tools as `mcp_<server>_<tool>`.
 */
export const McpBridgeModule: CortexModule = {
  metadata: {
    id: 'mcp-bridge',
    name: 'yui-mcp-bridge: Model Context Protocol Client',
    description: 'Connects external MCP servers (filesystem, browser, GitHub, etc.) and exposes their tools to Yui as mcp_<server>_<tool>.',
    version: '1.0.0',
    type: ModuleType.CORTEX,
    phase: 'PHASE 1: AGGREGATION',
    order: 0,
    configSchema: {
      fields: {
        enabled: {
          type: 'boolean',
          label: 'Enable MCP Bridge',
          default: false,
          description: 'When ON, Yui spawns the configured MCP servers at boot and registers their tools.'
        },
        serversJson: {
          type: 'textarea',
          label: 'MCP Servers (JSON)',
          default: '[]',
          description: 'JSON array of servers: [{"name":"filesystem","command":"npx","args":["-y","@modelcontextprotocol/server-filesystem","/path"],"env":{}}]. Tools appear as mcp_<server>_<tool>. Restart the daemon after changing this.'
        }
      }
    }
  },
  run: async (input: string, _state: any, context: any) => context
};
