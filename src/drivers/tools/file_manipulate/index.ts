import { ToolModule } from '../../../include/types';
import { SystemRegistry } from '../../../core/registry';
import { StandardizedProcessor } from '../../../core/kernel/processor';
import manifest from './manifest.json';

export const FileManipulationTool: ToolModule = {
  metadata: manifest as any,
  execute: async (args) => {
    const config = await SystemRegistry.getConfig('file_operations');
    const defaultZip = config.defaultArchiveName || 'archive_sync';
    const summaryPrompt = config.summaryInstruction || 'Buatlah ringkasan kognitif yang padat, informatif, dan terstruktur rapi dari dokumen berikut dalam bahasa Indonesia yang anggun:';

    console.log(`[FILE_HUB] Executing action: ${args.action} on target: ${args.target || 'N/A'}`);

    const execution = await StandardizedProcessor.executeStandardized(
      'file_operations',
      '1.0.0',
      { ...args },
      async () => {
        const payload = {
          action: args.action,
          target: args.target,
          files: args.files,
          archiveName: args.archiveName || defaultZip,
          sortBy: args.sortBy,
          targetFormat: args.targetFormat,
          options: {
            summaryPrompt
          }
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
          throw new Error(errData.error || `HTTP error! status: ${res.status}`);
        }

        return await res.json();
      }
    );

    if (execution.feedback.status === 'success') {
      return execution.output;
    } else {
      console.error("[FILE_HUB] Operational collapse during task execution:", (execution.feedback as any).message || (execution.feedback as any).errors);
      return {
        success: false,
        error: (execution.feedback as any).message || ((execution.feedback as any).errors?.join("; ")) || "Unknown file hub operational failure"
      };
    }
  }
};
