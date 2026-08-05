import { AI_NAME } from '@shared/constants';
import { SettingsManager } from './settings.js';

let cachedCharacterName: string | null = null;

export function getCharacterName(): string {
  if (cachedCharacterName) return cachedCharacterName;
  try {
    const value = SettingsManager.getInstance().get('characterName');
    cachedCharacterName = (value && String(value).trim()) || AI_NAME;
  } catch (_) {
    cachedCharacterName = AI_NAME;
  }
  return cachedCharacterName;
}

export function injectCharacterName(template: string): string {
  return template.replace(/\$\{characterName\}/g, getCharacterName());
}
