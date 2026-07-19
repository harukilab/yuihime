import { ToolModule } from '@shared/include/types';
import manifest from './manifest.json';

interface LogArgs {
  type?: 'audit' | 'llm' | 'all';
  limit?: number;
  offset?: number;
  filter?: string;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  return res.json();
}

export const ViewLogsTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: LogArgs = {}) => {
    try {
      const type = args.type || 'audit';
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 100);
      const offset = Math.max(Number(args.offset) || 0, 0);
      const searchKeyword = args.filter ? args.filter.toLowerCase() : '';

      const isServer = typeof window === 'undefined';
      const baseUrl = isServer
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : `${window.location.origin}`;

      // Unified 'all' branch: pull both audit + llm logs and merge them.
      if (type === 'all') {
        let auditLogs: any[] = [];
        let llmLogs: any[] = [];

        try {
          const data = await fetchJson(`${baseUrl}/api/cortex/audit-logs`);
          if (data.success && Array.isArray(data.auditLogs)) auditLogs = data.auditLogs;
        } catch (_) {}
        try {
          const data = await fetchJson(`${baseUrl}/api/cortex/llm-logs`);
          if (data.success && Array.isArray(data.logs)) llmLogs = data.logs;
        } catch (_) {}

        const applyFilter = (logs: any[], fields: (l: any) => string[]) =>
          searchKeyword
            ? logs.filter((l) => fields(l).some((f) => f.toLowerCase().includes(searchKeyword)))
            : logs;

        const formattedAudit = applyFilter(auditLogs, (l) => [
          l.toolName || '', l.endpointPath || '', l.status || '', l.error || '',
          JSON.stringify(l.parameters || ''), JSON.stringify(l.response || '')
        ]).map((l: any) => ({
          id: l.id,
          type: 'audit',
          timestamp: new Date(l.timestamp).toISOString(),
          toolName: l.toolName,
          endpointPath: l.endpointPath,
          parameters: l.parameters,
          response: l.response,
          status: l.status,
          error: l.error,
          standardsCompliance: l.standardsCompliance
        }));

        const formattedLlm = applyFilter(llmLogs, (l) => [l.content || '', l.type || '']).map((l: any) => ({
          id: l.id,
          type: 'llm',
          timestamp: l.timestamp ? new Date(l.timestamp).toISOString() : new Date().toISOString(),
          kind: l.type,
          content: l.content ? l.content.substring(0, 1500) + (l.content.length > 1500 ? '...' : '') : ''
        }));

        const combined = [...formattedAudit, ...formattedLlm]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        const totalAvailable = combined.length;
        const page = combined.slice(offset, offset + limit);

        return {
          success: true,
          count: page.length,
          totalAvailable,
          logType: 'all',
          offset,
          logs: page
        };
      }

      const endpoint = type === 'audit' ? '/api/cortex/audit-logs' : '/api/cortex/llm-logs';
      const data = await fetchJson(`${baseUrl}${endpoint}`);

      if (type === 'audit') {
        if (!data.success || !data.auditLogs) {
          return { success: false, error: 'Failed to fetch audit logs from backend' };
        }

        let logs = data.auditLogs;
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

        logs.sort((a: any, b: any) => b.timestamp - a.timestamp);
        const totalAvailable = logs.length;
        const limitedLogs = logs.slice(offset, offset + limit);

        return {
          success: true,
          count: limitedLogs.length,
          totalAvailable,
          offset,
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
        if (!data.success || !data.logs) {
          return { success: false, error: 'Failed to fetch LLM direct logs from backend' };
        }

        let logs = data.logs;
        if (searchKeyword) {
          logs = logs.filter((log: any) => {
            const content = (log.content || '').toLowerCase();
            const typeMsg = (log.type || '').toLowerCase();
            return content.includes(searchKeyword) || typeMsg.includes(searchKeyword);
          });
        }

        logs.sort((a: any, b: any) => b.timestamp - a.timestamp);
        const totalAvailable = logs.length;
        const limitedLogs = logs.slice(offset, offset + limit);

        return {
          success: true,
          count: limitedLogs.length,
          totalAvailable,
          offset,
          logType: 'llm',
          logs: limitedLogs.map((log: any) => ({
            timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
            type: log.type,
            content: log.content ? log.content.substring(0, 1500) + (log.content.length > 1500 ? '...' : '') : ''
          }))
        };
      }
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  }
};
