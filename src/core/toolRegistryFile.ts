import fs from 'fs';
import path from 'path';
import { SystemRegistry } from '@shared/core/registry';
import { resolveDataDir } from './systemPaths.js';

export function getAvailableToolsFile(): string {
  return path.join(resolveDataDir(), 'available_tools.json');
}

export function writeAvailableToolsFile(): { count: number; filePath: string } {
  const tools = SystemRegistry.getTools();
  const filePath = getAvailableToolsFile();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(tools.map((t: any) => t.metadata), null, 2), 'utf8');
  return { count: tools.length, filePath };
}
