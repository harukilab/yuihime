export interface AIConfig {
  model?: string;
  systemInstruction?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  isJson?: boolean;
  attachments?: any[];
  tools?: any[];
}
