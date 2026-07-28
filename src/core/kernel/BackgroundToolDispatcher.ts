import { SystemRegistry } from '@shared/core/registry';
import { APIService } from '@shared/services/api';
import { DynamicToolSynthesizer } from '../cortex/dynamicToolSynthesizer.js';
import { eventBus } from '@shared/core/kernel/event-bus';
import { broadcastToWS } from '../server/apiRouter.js';
import { BackgroundToolCall, BackgroundToolResult, PendingToolSet } from './BackgroundToolTypes.js';
import { Cortex } from '../cortex.js';

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_SHELL_TIMEOUT_MS = 120000;
const DEFAULT_RETRY_LIMIT = 2;

class BackgroundToolDispatcher {
  private static instance: BackgroundToolDispatcher | null = null;

  private pendingTools: Map<string, PendingToolSet> = new Map();
  private queue: BackgroundToolCall[] = [];
  private activeWorkers: number = 0;
  private readonly maxConcurrency: number;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.maxConcurrency = DEFAULT_MAX_CONCURRENCY;
    this._scheduleCleanup();
  }

  public static getInstance(): BackgroundToolDispatcher {
    if (!BackgroundToolDispatcher.instance) {
      BackgroundToolDispatcher.instance = new BackgroundToolDispatcher();
    }
    return BackgroundToolDispatcher.instance;
  }

  public enqueue(
    contextId: string,
    toolCalls: BackgroundToolCall[],
    settings: any,
    state: any,
    augContext: any,
    signal?: AbortSignal
  ): Promise<BackgroundToolResult[]> {
    if (this.pendingTools.has(contextId)) {
      const existing = this.pendingTools.get(contextId)!;
      if (existing.status === 'pending') {
        return existing.promise;
      }
    }

    const toolCallsCopy = [...toolCalls];
    let resolvePromise: (value: BackgroundToolResult[]) => void;
    let rejectPromise: (reason?: any) => void;
    const promise = new Promise<BackgroundToolResult[]>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    const pendingSet: PendingToolSet = {
      contextId,
      toolCalls: toolCallsCopy,
      promise,
      status: 'pending',
      createdAt: Date.now()
    };

    this.pendingTools.set(contextId, pendingSet);

    for (const tc of toolCallsCopy) {
      this.queue.push(tc);
    }

    setImmediate(() => {
      this._drainQueue(contextId, settings, state, augContext, signal, resolvePromise, rejectPromise);
    });

    return promise;
  }

  public getPending(contextId: string): PendingToolSet | undefined {
    return this.pendingTools.get(contextId);
  }

  public async drain(contextId: string): Promise<BackgroundToolResult[]> {
    const pending = this.pendingTools.get(contextId);
    if (!pending) {
      throw new Error(`No pending tool set for contextId: ${contextId}`);
    }
    return pending.promise;
  }

  public cancel(contextId: string): boolean {
    const pending = this.pendingTools.get(contextId);
    if (!pending) return false;

    this.pendingTools.delete(contextId);
    this.queue = this.queue.filter(tc => !pending.toolCalls.some(ptc => ptc.toolCallId === tc.toolCallId));
    pending.status = 'failed';
    pending.completedAt = Date.now();
    return true;
  }

  private async _drainQueue(
    contextId: string,
    settings: any,
    state: any,
    augContext: any,
    signal: AbortSignal | undefined,
    resolvePromise: (value: BackgroundToolResult[]) => void,
    rejectPromise: (reason?: any) => void
  ): Promise<void> {
    const pendingSet = this.pendingTools.get(contextId);
    if (!pendingSet || pendingSet.status !== 'pending') {
      return;
    }

    const remainingCalls = this.queue.filter(
      tc => pendingSet.toolCalls.some(ptc => ptc.toolCallId === tc.toolCallId)
    );

    if (remainingCalls.length === 0) {
      pendingSet.status = 'completed';
      pendingSet.completedAt = Date.now();
      resolvePromise(pendingSet.results || []);
      return;
    }

    const results: BackgroundToolResult[] = pendingSet.results || [];
    const maxToStart = Math.min(
      remainingCalls.length,
      this.maxConcurrency - this.activeWorkers
    );

    if (maxToStart <= 0) {
      setTimeout(() => {
        this._drainQueue(contextId, settings, state, augContext, signal, resolvePromise, rejectPromise);
      }, 50);
      return;
    }

    const toExecute = remainingCalls.slice(0, maxToStart);
    this.queue = this.queue.filter(tc => !toExecute.includes(tc));

    const execPromises = toExecute.map(async (tc) => {
      this.activeWorkers++;
      try {
        eventBus.emit('TOOL_BG_STARTED', { contextId, toolCallId: tc.toolCallId, toolName: tc.toolName });

        const result = await this._executeSingleTool(tc, settings, state, augContext, signal);

        eventBus.emit('TOOL_BG_COMPLETED', {
          contextId,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          success: result.success
        });

        if (typeof broadcastToWS === 'function') {
          try {
            broadcastToWS({
              type: 'tool_status',
              data: {
                contextId,
                status: result.success ? 'completed' : 'failed',
                toolName: tc.toolName
              }
            });
          } catch (_) {}
        }

        return result;
      } catch (err: any) {
        eventBus.emit('TOOL_BG_FAILED', {
          contextId,
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          error: err?.message || String(err)
        });

        if (typeof broadcastToWS === 'function') {
          try {
            broadcastToWS({
              type: 'tool_status',
              data: {
                contextId,
                status: 'failed',
                toolName: tc.toolName,
                error: err?.message || String(err)
              }
            });
          } catch (_) {}
        }

        return {
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          success: false,
          error: err?.message || String(err),
          durationMs: 0
        } as BackgroundToolResult;
      } finally {
        this.activeWorkers = Math.max(0, this.activeWorkers - 1);
      }
    });

    const execResults = await Promise.allSettled(execPromises);

    for (const settled of execResults) {
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        results.push({
          toolCallId: 'unknown',
          toolName: 'unknown',
          success: false,
          error: settled.reason?.message || String(settled.reason),
          durationMs: 0
        } as BackgroundToolResult);
      }
    }

    pendingSet.results = results;

    const stillInQueue = this.queue.some(
      tc => pendingSet.toolCalls.some(ptc => ptc.toolCallId === tc.toolCallId)
    );

    if (stillInQueue) {
      setImmediate(() => {
        this._drainQueue(contextId, settings, state, augContext, signal, resolvePromise, rejectPromise);
      });
    } else {
      pendingSet.status = 'completed';
      pendingSet.completedAt = Date.now();
      resolvePromise(results);
    }
  }

  private async _executeSingleTool(
    call: BackgroundToolCall,
    settings: any,
    state: any,
    augContext: any,
    signal: AbortSignal | undefined
  ): Promise<BackgroundToolResult> {
    const startTime = Date.now();
    const toolName = call.toolName;

    let tool = SystemRegistry.getTool(toolName);

    if (!tool) {
      console.log(`[BG_DISPATCHER] Tool '${toolName}' not found. Attempting dynamic synthesis...`);
      try {
        tool = await DynamicToolSynthesizer.synthesizeAndRegister(toolName, '', new Cortex());
      } catch (synthErr: any) {
        console.error(`[BG_DISPATCHER] Dynamic synthesis failed for '${toolName}':`, synthErr.message);
        return {
          toolCallId: call.toolCallId,
          toolName,
          success: false,
          error: `Tool not found and synthesis failed: ${synthErr.message}`,
          durationMs: Date.now() - startTime
        };
      }
    }

    if (!tool) {
      return {
        toolCallId: call.toolCallId,
        toolName,
        success: false,
        error: 'Tool not found',
        durationMs: Date.now() - startTime,
        notFound: true
      };
    }

    let res: any;
    try {
      let metaTimeoutMs: number | undefined;
      let parsedArgs: any = call.args;

      if (typeof parsedArgs === 'string') {
        try {
          const sanitized = parsedArgs.match(/\{[\s\S]*\}/);
          parsedArgs = sanitized ? JSON.parse(sanitized[0]) : {};
        } catch (_) {}
      }

      if (typeof parsedArgs !== 'object' || parsedArgs === null) {
        parsedArgs = {};
      }

      if (parsedArgs._meta && typeof parsedArgs._meta === 'object') {
        const m = parsedArgs._meta as any;
        if (typeof m.timeout_ms === 'number' && m.timeout_ms > 0) {
          metaTimeoutMs = Math.min(m.timeout_ms, 600000);
        }
        const stripped = { ...parsedArgs };
        delete stripped._meta;
        parsedArgs = stripped;
      }

      if (tool.metadata && tool.metadata.parameters) {
        const schema = tool.metadata.parameters;
        try {
          APIService.validateSchema(schema, parsedArgs, tool.metadata.id);
        } catch (_) {}
      }

      call.args = parsedArgs;

      if (signal?.aborted) {
        return {
          toolCallId: call.toolCallId,
          toolName,
          success: false,
          error: 'Tool execution aborted',
          durationMs: Date.now() - startTime,
          canceled: true
        };
      }

      let abortListener: (() => void) | null = null;
      const abortPromise = new Promise((_, reject) => {
        if (signal?.aborted) {
          reject(new Error('Tool execution aborted'));
          return;
        }
        abortListener = () => reject(new Error('Tool execution aborted'));
        signal?.addEventListener('abort', abortListener);
      });

      const toolExecutorConfig = settings?.['tool-executor'] || {};
      const generalTimeoutMs = toolExecutorConfig.timeoutMs !== undefined
        ? Number(toolExecutorConfig.timeoutMs)
        : DEFAULT_TIMEOUT_MS;
      const isShell = ['run_command', 'shell', 'execute_shell'].includes(toolName);
      const activeTimeoutMs = metaTimeoutMs !== undefined
        ? metaTimeoutMs
        : (isShell
          ? (toolExecutorConfig.shellTimeoutMs !== undefined ? Number(toolExecutorConfig.shellTimeoutMs) : DEFAULT_SHELL_TIMEOUT_MS)
          : generalTimeoutMs);

      let attempts = 0;
      const maxAttempts = (toolExecutorConfig.retryLimit !== undefined ? Number(toolExecutorConfig.retryLimit) : DEFAULT_RETRY_LIMIT) + 1;
      let lastErr: any = null;
      let toolRes: any = null;
      let success = false;

      while (attempts < maxAttempts && !success) {
        attempts++;
        try {
          if (attempts > 1) {
            console.log(`[BG_DISPATCHER] Retrying tool ${toolName} (Attempt ${attempts}/${maxAttempts})...`);
          }
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`Tool execution timed out after ${activeTimeoutMs / 1000} seconds`)), activeTimeoutMs)
          );

          toolRes = await Promise.race([
            tool.execute(parsedArgs, { state, ...augContext }),
            abortPromise,
            timeoutPromise
          ]);
          success = true;
        } catch (err: any) {
          lastErr = err;
          console.warn(`[BG_DISPATCHER] Attempt ${attempts} failed for tool ${toolName}:`, err.message);
          if (attempts >= maxAttempts) {
            throw err;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      if (abortListener && signal) {
        signal.removeEventListener('abort', abortListener);
      }

      const isCanceled = lastErr?.message?.includes('aborted');

      res = {
        tool: toolName,
        observation: toolRes,
        success: !isCanceled,
        durationMs: Date.now() - startTime
      };
    } catch (err: any) {
      const isCanceled = err?.message?.includes('aborted');
      console.error(`[BG_DISPATCHER] Tool execution failed for ${toolName}:`, err.message);
      res = {
        tool: toolName,
        error: isCanceled ? 'Execution aborted' : `Execution failed: ${err.message}`,
        success: !isCanceled,
        canceled: isCanceled,
        durationMs: Date.now() - startTime
      };
    }

    return {
      toolCallId: call.toolCallId,
      toolName,
      success: res.success,
      observation: res.success ? res.observation : null,
      error: res.success ? undefined : (res.error || 'Tool execution failed'),
      durationMs: res.durationMs || Date.now() - startTime,
      canceled: res.canceled || false
    };
  }

  private _cleanup(): void {
    const now = Date.now();
    const expiredIds: string[] = [];

    this.pendingTools.forEach((pending, contextId) => {
      if (now - pending.createdAt > PENDING_TTL_MS) {
        expiredIds.push(contextId);
      }
    });

    for (const id of expiredIds) {
      const pending = this.pendingTools.get(id);
      if (pending && pending.status === 'pending') {
        pending.status = 'failed';
        pending.completedAt = Date.now();
        pending.results = pending.results || [];
      }
      this.pendingTools.delete(id);
    }

    if (expiredIds.length > 0) {
      console.log(`[BG_DISPATCHER] Cleanup removed ${expiredIds.length} expired pending tool set(s).`);
    }

    this._scheduleCleanup();
  }

  private _scheduleCleanup(): void {
    this.cleanupTimer = setTimeout(() => {
      this._cleanup();
    }, CLEANUP_INTERVAL_MS);
  }
}

export { BackgroundToolDispatcher };
