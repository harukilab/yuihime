import { ToolModule } from '@shared/include/types';
import { SystemRegistry } from '@shared/core/registry';
import manifest from './manifest.json';

const AUTOMATION_ACTIONS = ['sort', 'archive', 'summarize', 'convert'];

export const FileManagerTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args: any) => {
    try {
      const action = args.action;

      // Automation actions (sort / archive / summarize / convert) are routed to the
      // file-manipulate backend which performs non-destructive batch operations.
      if (AUTOMATION_ACTIONS.includes(action)) {
        const config = await SystemRegistry.getConfig('file_manager').catch(() => ({} as any));
        const defaultZip = (config && config.defaultArchiveName) || 'archive_sync';
        const summaryPrompt = (config && config.summaryInstruction) ||
          'Buatlah ringkasan kognitif yang padat, informatif, dan terstruktur rapi dari dokumen berikut dalam bahasa Indonesia yang anggun:';

        const payload = {
          action,
          target: args.target,
          files: args.files,
          archiveName: args.archiveName || defaultZip,
          sortBy: args.sortBy,
          targetFormat: args.targetFormat,
          options: { summaryPrompt }
        };

        const isServer = typeof window === 'undefined';
        const baseUrl = isServer
          ? `http://127.0.0.1:${process.env.PORT || "3000"}`
          : `${window.location.origin}`;

        const res = await fetch(`${baseUrl}/api/sandbox/file-manipulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          return {
            success: false,
            error: errData.error || `HTTP error! status: ${res.status}`
          };
        }

        return await res.json();
      }

      // Standard file operations handled by the dedicated file-manager backend.
      const isServer = typeof window === 'undefined';
      const baseUrl = isServer
        ? `http://127.0.0.1:${process.env.PORT || "3000"}`
        : `${window.location.origin}`;
      const res = await fetch(`${baseUrl}/api/tools/files/manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          source: args.source,
          destination: args.destination,
          path: args.path,
          recursive: args.recursive,
          pattern: args.pattern
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return {
          success: false,
          error: errData.error || `HTTP error! status: ${res.status}`
        };
      }

      return await res.json();
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Unknown network error'
      };
    }
  }
};
