import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

interface LogArgs {
  logType: 'audit' | 'llm';
  limit?: number;
  filter?: string;
}

export const ViewLogsTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: LogArgs) => {
    try {
      const type = args.logType || 'audit';
      const limit = args.limit || 10;
      const searchKeyword = args.filter ? args.filter.toLowerCase() : '';

      const isServer = typeof window === 'undefined';
      const baseUrl = isServer 
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : `${window.location.origin}`;

      if (type === 'audit') {
        const res = await fetch(`${baseUrl}/api/cortex/audit-logs`);
        const data = await res.json();
        
        if (!data.success || !data.auditLogs) {
          return { success: false, error: 'Failed to fetch audit logs from backend' };
        }

        let logs = data.auditLogs;

        // Apply keyword filter
        if (searchKeyword) {
          logs = logs.filter((log: any) => {
            const toolName = (log.toolName || '').toLowerCase();
            const path = (log.endpointPath || '').toLowerCase();
            const status = (log.status || '').toLowerCase();
            const error = (log.error || '').toLowerCase();
            const paramsStr = log.parameters ? JSON.stringify(log.parameters).toLowerCase() : '';
            const respStr = log.response ? JSON.stringify(log.response).toLowerCase() : '';

            return (
              toolName.includes(searchKeyword) ||
              path.includes(searchKeyword) ||
              status.includes(searchKeyword) ||
              error.includes(searchKeyword) ||
              paramsStr.includes(searchKeyword) ||
              respStr.includes(searchKeyword)
            );
          });
        }

        // Sort by timestamp descending (most recent first) and slice
        logs.sort((a: any, b: any) => b.timestamp - a.timestamp);
        const limitedLogs = logs.slice(0, limit);

        return {
          success: true,
          count: limitedLogs.length,
          totalAvailable: logs.length,
          logType: 'audit',
          logs: limitedLogs.map((log: any) => ({
            id: log.id,
            timestamp: new Date(log.timestamp).toISOString(),
            toolName: log.toolName,
            endpointPath: log.endpointPath,
            parameters: log.parameters,
            response: log.response,
            status: log.status,
            error: log.error,
            standardsCompliance: log.standardsCompliance
          }))
        };
      } else {
        const res = await fetch(`${baseUrl}/api/cortex/llm-logs`);
        const data = await res.json();
        
        if (!data.success || !data.logs) {
          return { success: false, error: 'Failed to fetch LLM direct logs from backend' };
        }

        let logs = data.logs;

        // Apply keyword filter
        if (searchKeyword) {
          logs = logs.filter((log: any) => {
            const content = (log.content || '').toLowerCase();
            const typeMsg = (log.type || '').toLowerCase();
            return content.includes(searchKeyword) || typeMsg.includes(searchKeyword);
          });
        }

        // LLM logs might already have timestamp, check and sort
        logs.sort((a: any, b: any) => b.timestamp - a.timestamp);
        const limitedLogs = logs.slice(0, limit);

        return {
          success: true,
          count: limitedLogs.length,
          totalAvailable: logs.length,
          logType: 'llm',
          logs: limitedLogs.map((log: any) => ({
            timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
            type: log.type, // 'prompt' or 'completion'
            content: log.content ? log.content.substring(0, 1500) + (log.content.length > 1500 ? '...' : '') : ''
          }))
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }
};
