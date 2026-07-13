import { ToolModule } from '../../../include/types';
import manifest from './manifest.json';

interface LogArgs {
  type?: 'audit' | 'llm' | 'all';
  limit?: number;
}

export const ViewSystemLogsTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: LogArgs = {}) => {
    const logType = args.type || 'all';
    const limit = args.limit || 10;

    try {
      let auditLogs: any[] = [];
      let llmLogs: any[] = [];

      const isServer = typeof window === 'undefined';
      const baseUrl = isServer 
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : `${window.location.origin}`;

      // Fetch Audit Logs if needed
      if (logType === 'audit' || logType === 'all') {
        try {
          const res = await fetch(`${baseUrl}/api/cortex/audit-logs`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.auditLogs)) {
              auditLogs = data.auditLogs;
            }
          }
        } catch (err: any) {
          console.error('[ViewSystemLogsTool] Failed to fetch audit logs:', err.message);
        }
      }

      // Fetch LLM/Cognitive logs if needed
      if (logType === 'llm' || logType === 'all') {
        try {
          const res = await fetch(`${baseUrl}/api/cortex/llm-logs`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.logs)) {
              llmLogs = data.logs;
            }
          }
        } catch (err: any) {
          console.error('[ViewSystemLogsTool] Failed to fetch LLM logs:', err.message);
        }
      }

      // Process and format responses
      if (logType === 'audit') {
        return {
          success: true,
          type: 'audit',
          totalAvailable: auditLogs.length,
          logs: auditLogs.slice(0, limit)
        };
      }

      if (logType === 'llm') {
        // Map LLM logs to a slightly more compact view if they are too large
        const formattedLlmLogs = llmLogs.slice(0, limit).map((log: any) => ({
          id: log.id,
          timestamp: new Date(log.timestamp).toISOString(),
          provider: log.provider,
          model: log.model,
          promptLength: log.prompt ? log.prompt.length : 0,
          responseLength: log.response ? log.response.length : 0,
          error: log.error || null,
          promptPreview: log.prompt ? log.prompt.substring(0, 300) + (log.prompt.length > 300 ? '...' : '') : '',
          responsePreview: log.response ? log.response.substring(0, 300) + (log.response.length > 300 ? '...' : '') : ''
        }));

        return {
          success: true,
          type: 'llm',
          totalAvailable: llmLogs.length,
          logs: formattedLlmLogs
        };
      }

      // If 'all', merge them of format them nicely
      const formattedLlmLogs = llmLogs.slice(0, limit).map((log: any) => ({
        id: log.id,
        type: 'llm_cognitive',
        timestamp: log.timestamp,
        timestampStr: new Date(log.timestamp).toISOString(),
        provider: log.provider,
        model: log.model,
        hasError: !!log.error,
        error: log.error || null,
        promptPreview: log.prompt ? log.prompt.substring(0, 200) + (log.prompt.length > 200 ? '...' : '') : '',
        responsePreview: log.response ? log.response.substring(0, 200) + (log.response.length > 200 ? '...' : '') : ''
      }));

      const formattedAuditLogs = auditLogs.slice(0, limit).map((log: any) => ({
        id: log.id || `audit_${Math.random().toString(36).substring(2, 9)}`,
        type: 'system_audit',
        timestamp: log.timestamp || Date.now(),
        timestampStr: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
        event: log.event || log.action || 'System Event',
        message: log.message || JSON.stringify(log),
        status: log.status || 'info'
      }));

      // Combine and sort by timestamp descending
      const combined = [...formattedLlmLogs, ...formattedAuditLogs]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);

      return {
        success: true,
        type: 'all',
        totalAvailable: auditLogs.length + llmLogs.length,
        logs: combined
      };

    } catch (globalErr: any) {
      return {
        success: false,
        error: globalErr.message || 'Unknown error occurred while view_system_logs executed.'
      };
    }
  }
};
