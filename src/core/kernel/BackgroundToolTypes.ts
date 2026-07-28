export interface BackgroundToolCall {
  toolCallId: string;
  toolName: string;
  args: any;
  timeoutMs?: number;
  metaTimeoutMs?: number;
  attempt?: number;
}

export interface BackgroundToolResult {
  toolCallId: string;
  toolName: string;
  success: boolean;
  observation?: any;
  error?: string;
  durationMs: number;
  notFound?: boolean;
  canceled?: boolean;
}

export type PendingToolStatus = 'pending' | 'completed' | 'failed';

export interface PendingToolSet {
  contextId: string;
  toolCalls: BackgroundToolCall[];
  promise: Promise<BackgroundToolResult[]>;
  results?: BackgroundToolResult[];
  status: PendingToolStatus;
  createdAt: number;
  completedAt?: number;
}