import { SettingsManager } from './settings.js';
import { AIConfig } from './ai/aiTypes.js';
import { generateContent, executeGoogleSearch } from './ai/generateSegment.js';
import { listModels as listModelsSeg } from './ai/listModelsSegment.js';
import { proxyAIRequest } from './ai/proxySegment.js';

export type { AIConfig };

export class AIService {
  private static instance: AIService;
  private settings = SettingsManager.getInstance();

  private constructor() {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  public async generate(prompt: string, config: AIConfig & { apiKey?: string } = {}) {
    return generateContent(prompt, config);
  }

  public async search(query: string): Promise<any[]> {
    return executeGoogleSearch(query);
  }

  public async listModels(provider: string = 'gemini', providedApiKey?: string, baseUrlOverride?: string) {
    return listModelsSeg(provider, providedApiKey, baseUrlOverride);
  }

  public async proxy(options: { url: string; method?: string; headers?: any; body?: any }) {
    return proxyAIRequest(options);
  }
}
