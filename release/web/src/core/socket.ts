import { eventBus } from '@shared/core/kernel/event-bus';

export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'offline' | 'error';

export interface AvatarAnimationTrigger {
  motionGroup?: string;
  motionIndex?: number;
  expression?: string;
  emote?: string;
  duration?: number;
  intensity?: number;
  raw?: any;
}

export interface TTSAudioStreamPayload {
  audioUrl?: string;
  base64Audio?: string;
  chunk?: string;
  mimeType?: string;
  sampleRate?: number;
  isFinal?: boolean;
  text?: string;
  speaker?: string;
  duration?: number;
  raw?: any;
}

export interface SocketMessagePayload {
  type: string;
  data?: any;
  timestamp?: number;
  [key: string]: any;
}

/**
 * SocketService: Centralized service for managing real-time WebSocket / event-stream
 * communications between the Web UI and the Yuihime server daemon backend.
 * 
 * Note: Designed with strict offline tolerance so the Web UI remains fully functional
 * even if the backend server is offline or unreachable.
 */
export class SocketService {
  private static instance: SocketService | null = null;

  private ws: WebSocket | null = null;
  private status: SocketStatus = 'disconnected';
  private reconnectTimer: any = null;
  private pingIntervalTimer: any = null;
  private reconnectDelay = 2000;
  private maxReconnectDelay = 30000;
  private explicitDisconnect = false;
  private serverUrl = '';

  private listeners: Set<(msg: SocketMessagePayload) => void> = new Set();
  private typeListeners: Map<string, Set<(data: any) => void>> = new Map();
  private animationListeners: Set<(anim: AvatarAnimationTrigger) => void> = new Set();
  private audioStreamListeners: Set<(audio: TTSAudioStreamPayload) => void> = new Set();

  private constructor() {
    // Singleton
  }

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  /**
   * Connects to the WebSocket gateway.
   * Gracefully handles connection failures without breaking UI execution.
   */
  public connect(customUrl?: string): void {
    if (typeof window === 'undefined') return;

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.explicitDisconnect = false;
    const loc = window.location;
    const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    this.serverUrl = customUrl || `${proto}//${loc.host}/ws`;

    this.updateStatus('connecting');

    try {
      this.ws = new WebSocket(this.serverUrl);

      this.ws.onopen = () => {
        console.info('[SocketService] WebSocket connection established successfully:', this.serverUrl);
        this.updateStatus('connected');
        this.reconnectDelay = 2000;
        this.clearReconnectTimer();
        this.startHeartbeat();

        // Broadcast initial handshake or sync request if required
        this.send('client_hello', {
          client: 'web_ui',
          version: '4.108',
          timestamp: Date.now()
        });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.handleRawMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.warn('[SocketService] WebSocket connection error (UI running in offline mode):', err);
        this.updateStatus('offline');
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.ws = null;
        this.updateStatus('offline');

        if (!this.explicitDisconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (e) {
      console.warn('[SocketService] Failed to create WebSocket client (Server offline). UI remains active.', e);
      this.updateStatus('offline');
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnects explicitly from the server.
   */
  public disconnect(): void {
    this.explicitDisconnect = true;
    this.clearReconnectTimer();
    this.stopHeartbeat();

    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        /* Ignore close error */
      }
      this.ws = null;
    }
    this.updateStatus('disconnected');
  }

  /**
   * Safely sends a JSON payload over WebSocket.
   * Returns true if successfully queued/sent, false if server is offline.
   */
  public send(type: string, data?: any): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.debug(`[SocketService] Cannot send '${type}' - Server is offline or connecting.`);
      return false;
    }

    try {
      const payload = JSON.stringify({
        type,
        data,
        timestamp: Date.now()
      });
      this.ws.send(payload);
      return true;
    } catch (e) {
      console.error('[SocketService] Error sending socket message:', e);
      return false;
    }
  }

  /**
   * Parse raw incoming server messages and route animation/audio/state events.
   */
  private handleRawMessage(raw: string): void {
    try {
      const payload: SocketMessagePayload = JSON.parse(raw);
      if (!payload || !payload.type) return;

      const { type, data } = payload;

      // 1. Notify global message listeners
      this.listeners.forEach((listener) => {
        try { listener(payload); } catch (e) { console.error('[SocketService] Listener error:', e); }
      });

      // 2. Notify type-specific listeners
      const specificTypeListeners = this.typeListeners.get(type);
      if (specificTypeListeners) {
        specificTypeListeners.forEach((cb) => {
          try { cb(data); } catch (e) { console.error(`[SocketService] Type listener error for '${type}':`, e); }
        });
      }

      // 3. Emit on global EventBus
      eventBus.emit(type, data);

      // 4. Parse Avatar Animation Triggers
      if (this.isAnimationTriggerEvent(type)) {
        const animTrigger = this.parseAnimationTrigger(type, data);
        this.animationListeners.forEach((cb) => {
          try { cb(animTrigger); } catch (e) { console.error('[SocketService] Animation listener error:', e); }
        });
        eventBus.emit('AVATAR_ANIMATION_TRIGGER', animTrigger);
        eventBus.emit('AVATAR_EXPRESSION_TRIGGER', animTrigger);
      }

      // 5. Parse TTS Audio Stream & Audio Chunks
      if (this.isAudioStreamEvent(type)) {
        const audioPayload = this.parseAudioStreamPayload(type, data);
        this.audioStreamListeners.forEach((cb) => {
          try { cb(audioPayload); } catch (e) { console.error('[SocketService] Audio stream listener error:', e); }
        });
        eventBus.emit('TTS_AUDIO_STREAM', audioPayload);
        eventBus.emit('AUDIO_SYNC_EVENT', {
          event: 'play',
          audio: audioPayload,
          source: 'socket_stream'
        });

        // Automatically decode & play base64 audio if provided
        if (audioPayload.base64Audio) {
          this.playBase64Audio(audioPayload.base64Audio, audioPayload.mimeType);
        }
      }

    } catch (e) {
      console.error('[SocketService] Failed to parse incoming WebSocket frame:', e);
    }
  }

  /**
   * Helper: Checks if message type represents an avatar animation trigger.
   */
  private isAnimationTriggerEvent(type: string): boolean {
    const animationTypes = [
      'avatar_animation',
      'motion_trigger',
      'expression_change',
      'avatar_action',
      'motion',
      'expression',
      'emote_trigger',
      'pose_change'
    ];
    return animationTypes.includes(type);
  }

  /**
   * Helper: Parses structured AvatarAnimationTrigger from server data.
   */
  private parseAnimationTrigger(type: string, data: any = {}): AvatarAnimationTrigger {
    if (typeof data === 'string') {
      return {
        motionGroup: 'Idle',
        expression: data,
        emote: data,
        raw: data
      };
    }

    return {
      motionGroup: data.motionGroup || data.group || data.motion || 'Idle',
      motionIndex: typeof data.motionIndex === 'number' ? data.motionIndex : (typeof data.index === 'number' ? data.index : 0),
      expression: data.expression || data.expr || data.emote || '',
      emote: data.emote || data.expression || '',
      duration: data.duration,
      intensity: data.intensity,
      raw: data
    };
  }

  /**
   * Helper: Checks if message type represents a TTS audio stream or audio chunk.
   */
  private isAudioStreamEvent(type: string): boolean {
    const audioTypes = [
      'tts_audio_stream',
      'audio_chunk',
      'tts_audio',
      'audio_stream',
      'speech_stream',
      'voice_chunk'
    ];
    return audioTypes.includes(type);
  }

  /**
   * Helper: Parses structured TTSAudioStreamPayload from server data.
   */
  private parseAudioStreamPayload(type: string, data: any = {}): TTSAudioStreamPayload {
    if (typeof data === 'string') {
      return {
        base64Audio: data,
        isFinal: true,
        mimeType: 'audio/mp3',
        raw: data
      };
    }

    return {
      audioUrl: data.audioUrl || data.url,
      base64Audio: data.base64Audio || data.audio || data.chunk || data.buffer,
      chunk: data.chunk,
      mimeType: data.mimeType || data.format || 'audio/mp3',
      sampleRate: data.sampleRate || 24000,
      isFinal: data.isFinal ?? true,
      text: data.text || data.transcript || '',
      speaker: data.speaker || data.voice || 'Yuihime',
      duration: data.duration,
      raw: data
    };
  }

  /**
   * Optional helper: Plays base64 audio stream using Web Audio API safely.
   */
  private playBase64Audio(base64Data: string, mimeType = 'audio/mp3'): void {
    if (typeof window === 'undefined') return;

    try {
      const cleanBase64 = base64Data.replace(/^data:audio\/\w+;base64,/, '');
      const binaryString = window.atob(cleanBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioBlob = new Blob([bytes.buffer], { type: mimeType });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      audio.onplay = () => {
        eventBus.emit('AUDIO_SYNC_EVENT', { event: 'play', source: 'tts_socket' });
      };

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        eventBus.emit('AUDIO_SYNC_EVENT', { event: 'ended', source: 'tts_socket' });
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
      };

      audio.play().catch((err) => {
        console.warn('[SocketService] Auto-play prevented or failed for TTS stream:', err);
      });
    } catch (e) {
      console.error('[SocketService] Error decoding base64 audio stream:', e);
    }
  }

  /**
   * Schedule exponential backoff reconnect attempt.
   */
  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(() => {
      if (!this.explicitDisconnect && (!this.ws || this.ws.readyState === WebSocket.CLOSED)) {
        console.log(`[SocketService] Attempting reconnection (backoff ${this.reconnectDelay}ms)...`);
        this.connect(this.serverUrl);
      }
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, this.maxReconnectDelay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingIntervalTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send('ping');
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
      this.pingIntervalTimer = null;
    }
  }

  private updateStatus(newStatus: SocketStatus): void {
    if (this.status !== newStatus) {
      this.status = newStatus;
      eventBus.emit('WS_STATUS_CHANGE', { status: newStatus, isConnected: this.isConnected() });
    }
  }

  // --- Public API & Listener Registration Methods ---

  public getStatus(): SocketStatus {
    return this.status;
  }

  public isConnected(): boolean {
    return this.status === 'connected' && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Subscribe to avatar animation triggers parsed from server events.
   */
  public onAnimationTrigger(callback: (anim: AvatarAnimationTrigger) => void): () => void {
    this.animationListeners.add(callback);
    return () => {
      this.animationListeners.delete(callback);
    };
  }

  /**
   * Subscribe to TTS audio streams and audio chunks.
   */
  public onAudioStream(callback: (audio: TTSAudioStreamPayload) => void): () => void {
    this.audioStreamListeners.add(callback);
    return () => {
      this.audioStreamListeners.delete(callback);
    };
  }

  /**
   * Subscribe to agent/system state updates.
   */
  public onStateUpdate(callback: (state: any) => void): () => void {
    return this.on('state_update', callback);
  }

  /**
   * Subscribe to specific server message types.
   */
  public on(type: string, callback: (data: any) => void): () => void {
    if (!this.typeListeners.has(type)) {
      this.typeListeners.set(type, new Set());
    }
    this.typeListeners.get(type)?.add(callback);

    return () => {
      const set = this.typeListeners.get(type);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.typeListeners.delete(type);
        }
      }
    };
  }

  /**
   * General subscription to all incoming parsed socket messages.
   */
  public subscribe(listener: (msg: SocketMessagePayload) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const socketService = SocketService.getInstance();
