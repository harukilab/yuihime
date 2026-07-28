import { ProviderConfig, MoodState, AgentState, CortexModule } from "@shared/include/types";
import { StorageService } from "@shared/drivers/storage";
import { SystemRegistry } from "@shared/core/registry";
import { getActiveVowel } from "@web/ui/avatar/vowelExtractor";
import { eventBus } from '@shared/core/kernel/event-bus';

export interface SpeechTickEvent {
  speaking: boolean;
  charIndex: number;
  progress: number;
  vowel: 'a' | 'i' | 'u' | 'e' | 'o' | 'consonant' | 'pause';
  intensity: number;
  currentTime: number;
  duration: number;
  currentSpokenText: string;
}

export class SpeechService {
  private static synth: any = null;
  private static getSynth(): any {
    if (!SpeechService.synth && typeof window !== 'undefined') {
      SpeechService.synth = (window as any).speechSynthesis;
    }
    return SpeechService.synth;
  }
  private static voice: SpeechSynthesisVoice | null = null;
  private static enabled: boolean = true;
  private static onSpeakListeners: ((speaking: boolean) => void)[] = [];
  private static onProgressListeners: ((charIndex: number) => void)[] = [];
  private static onVolumeListeners: ((volume: number) => void)[] = [];
  private static onTickListeners: ((ev: SpeechTickEvent) => void)[] = [];
  
  private static audioContext: AudioContext | null = null;
  private static analyser: AnalyserNode | null = null;
  private static dataArray: Uint8Array | null = null;
  private static isAnalyzing: boolean = false;
  private static currentSpokenText: string = "";

  private static tickFrameId: number | null = null;
  private static tickActive: boolean = false;

  static subscribe(listener: (speaking: boolean) => void) {
    this.onSpeakListeners.push(listener);
    return () => {
      this.onSpeakListeners = this.onSpeakListeners.filter(l => l !== listener);
    };
  }

  static subscribeProgress(listener: (charIndex: number) => void) {
    this.onProgressListeners.push(listener);
    return () => {
      this.onProgressListeners = this.onProgressListeners.filter(l => l !== listener);
    };
  }

  static subscribeVolume(listener: (volume: number) => void) {
    this.onVolumeListeners.push(listener);
    return () => {
      this.onVolumeListeners = this.onVolumeListeners.filter(l => l !== listener);
    };
  }

  static subscribeTick(listener: (ev: SpeechTickEvent) => void) {
    this.onTickListeners.push(listener);
    return () => {
      this.onTickListeners = this.onTickListeners.filter(l => l !== listener);
    };
  }

  private static notify(speaking: boolean) {
    this.onSpeakListeners.forEach(l => l(speaking));
  }

  private static notifyProgress(charIndex: number) {
    this.onProgressListeners.forEach(l => l(charIndex));
  }

  private static notifyVolume(volume: number) {
    this.onVolumeListeners.forEach(l => l(volume));
  }

  private static notifyTick(ev: SpeechTickEvent) {
    this.onTickListeners.forEach(l => l(ev));
  }

  static init() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const loadVoices = () => {
      const voices = this.getSynth().getVoices();
      this.voice = voices.find(v => v.name.includes('Google') && v.name.includes('Female')) || 
                   voices.find(v => v.name.includes('Female')) || 
                   voices[0];
    };

    if (this.getSynth().onvoiceschanged !== undefined) {
      this.getSynth().onvoiceschanged = loadVoices;
    }
    loadVoices();
  }

  static setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.getSynth().cancel();
  }

  static isEnabled() {
    return this.enabled;
  }

  private static activeAudio: HTMLAudioElement | null = null;

  static isSpeaking() {
    return this.tickActive;
  }

  private static startTickLoop(audio?: HTMLAudioElement, durationFallback: number = 3000) {
    this.stopTickLoop();
    this.tickActive = true;
    
    const text = this.currentSpokenText || "";
    const startTime = Date.now();
    
    const tick = () => {
      if (!this.tickActive) return;
      
      let currentTime = 0;
      let duration = durationFallback;
      let speaking = false;
      let intensity = 0;
      
      if (audio) {
        currentTime = audio.currentTime;
        duration = audio.duration || durationFallback;
        if (isNaN(duration) || duration === Infinity) {
          duration = durationFallback;
        }
        speaking = !audio.paused && !audio.ended;
        
        // Calculate real-time volume if analyzing, otherwise procedural faux volume
        if (this.isAnalyzing && this.analyser && this.dataArray) {
          this.analyser.getByteFrequencyData(this.dataArray);
          let sum = 0;
          let count = 0;
          const bufferLength = this.analyser.frequencyBinCount;
          for (let i = 0; i < bufferLength; i++) {
            sum += this.dataArray[i];
            if (this.dataArray[i] > 0) count++;
          }
          const volume = count > 0 ? (sum / bufferLength / 255) : 0;
          intensity = Math.min(1.0, volume * 1.5);
        } else {
          // Procedural wave volume aligned with audio currentTime
          const frame = Math.floor(currentTime * 60);
          const base = Math.sin(frame * 0.2) * 0.25 + 0.35;
          const details = Math.sin(frame * 0.8) * 0.12;
          const noise = Math.random() * 0.08;
          const gating = Math.sin(frame * 0.04) > -0.75 ? 1 : 0;
          intensity = (base + details + noise) * gating;
          intensity = Math.max(0, Math.min(1.0, intensity));
        }
      } else {
        // Fallback for browser SpeechSynthesis or when no audio element is provided
        const elapsed = Date.now() - startTime;
        currentTime = elapsed / 1000;
        speaking = this.getSynth().speaking;
        
        // Procedural volume
        const frame = Math.floor(currentTime * 60);
        const base = Math.sin(frame * 0.15) * 0.2 + 0.3;
        const detailing = Math.sin(frame * 0.8) * 0.1;
        const noise = Math.random() * 0.15;
        const gating = Math.sin(frame * 0.05) > -0.6 ? 1 : 0;
        intensity = (base + detailing + noise) * gating;
        intensity = Math.max(0, Math.min(1.0, intensity));
        
        if (currentTime >= duration) {
          speaking = false;
        }
      }
      
      const progress = duration > 0 ? Math.max(0, Math.min(1.0, currentTime / duration)) : 0;
      const textLen = text.length;
      const charIndex = textLen > 0 ? Math.min(textLen - 1, Math.floor(progress * textLen)) : -1;
      
      let vowel: 'a'|'i'|'u'|'e'|'o'|'consonant'|'pause' = 'pause';
      if (speaking && charIndex >= 0) {
        // Calculate vowel for the precise spoken substring
        const sub = text.substring(0, charIndex + 1);
        vowel = getActiveVowel(sub);
      }
      
      // Dispatch micro-event
      this.notifyTick({
        speaking,
        charIndex,
        progress,
        vowel,
        intensity,
        currentTime,
        duration,
        currentSpokenText: text
      });
      
      // Also notify existing subscribers so standard subtitles and mouth flaps stay perfectly aligned!
      this.notifyVolume(speaking ? intensity : 0);
      if (speaking && charIndex >= 0) {
        this.notifyProgress(charIndex);
      }
      
      if (speaking) {
        this.tickFrameId = requestAnimationFrame(tick);
      } else {
        // Complete state
        this.stopTickLoop();
        this.notifyTick({
          speaking: false,
          charIndex: -1,
          progress: 1.0,
          vowel: 'pause',
          intensity: 0,
          currentTime: duration,
          duration,
          currentSpokenText: text
        });
        this.notifyProgress(-1);
        this.notifyVolume(0);
      }
    };
    
    this.tickFrameId = requestAnimationFrame(tick);
  }
  
  private static stopTickLoop() {
    this.tickActive = false;
    if (this.tickFrameId !== null) {
      cancelAnimationFrame(this.tickFrameId);
      this.tickFrameId = null;
    }
  }

  public static async analyzeAudioStream(audio: HTMLAudioElement) {
    if (this.activeAudio && this.activeAudio !== audio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch (err) {}
    }
    this.activeAudio = audio;
    this.stopTickLoop();

    try {
      if (!this.audioContext) {
        this.init();
      }
      
      if (this.audioContext && this.audioContext.state === 'suspended') {
        try {
          await this.audioContext.resume();
        } catch (err) {}
      }

      this.isAnalyzing = true;
      audio.crossOrigin = 'anonymous';

      try {
        if (this.audioContext) {
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 256;
          const source = this.audioContext.createMediaElementSource(audio);
          source.connect(this.analyser);
          this.analyser.connect(this.audioContext.destination);
          const bufferLength = this.analyser.frequencyBinCount;
          this.dataArray = new Uint8Array(bufferLength);
        }
      } catch (setupErr) {
        console.warn("[SpeechService] Failed to bind Web Audio MediaElementSource (CORS or active state restriction). Falling back to faux volume analysis:", setupErr);
        this.analyser = null;
        this.dataArray = null;
      }

      const onPlay = () => {
        this.isAnalyzing = true;
        const textLen = (this.currentSpokenText || "").length;
        const estDuration = Math.max(1.5, textLen / 12) * 1000;
        this.startTickLoop(audio, estDuration);
        this.notify(true);
        
        eventBus.emit('AUDIO_SYNC_EVENT', {
          event: 'play',
          currentSpokenText: this.currentSpokenText,
          currentTime: audio.currentTime,
          duration: audio.duration || estDuration / 1000,
          audioUrl: audio.src
        });
      };

      const onPause = () => {
        this.isAnalyzing = false;
        this.stopTickLoop();
        this.notify(false);
        
        eventBus.emit('AUDIO_SYNC_EVENT', {
          event: 'pause',
          currentSpokenText: this.currentSpokenText,
          currentTime: audio.currentTime,
          duration: audio.duration || 0,
          audioUrl: audio.src
        });
      };

      const onEnded = () => {
        this.isAnalyzing = false;
        this.stopTickLoop();
        this.notify(false);
        
        eventBus.emit('AUDIO_SYNC_EVENT', {
          event: 'ended',
          currentSpokenText: this.currentSpokenText,
          currentTime: audio.currentTime,
          duration: audio.duration || 0,
          audioUrl: audio.src
        });
      };

      audio.addEventListener('play', onPlay);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('ended', onEnded);

      if (!audio.paused) {
        onPlay();
      }
    } catch (e) {
      console.warn("[SpeechService] Audio stream analysis initialization aborted:", e);
      const playHandler = () => {
        const textLen = (this.currentSpokenText || "").length;
        const estDuration = Math.max(1.5, textLen / 12) * 1000;
        this.startTickLoop(audio, estDuration);
        this.notify(true);
        
        eventBus.emit('AUDIO_SYNC_EVENT', {
          event: 'play',
          currentSpokenText: this.currentSpokenText,
          currentTime: audio.currentTime,
          duration: audio.duration || estDuration / 1000,
          audioUrl: audio.src
        });
      };
      
      const pauseHandler = () => {
        this.stopTickLoop();
        this.notify(false);
        eventBus.emit('AUDIO_SYNC_EVENT', {
          event: 'pause',
          currentSpokenText: this.currentSpokenText,
          currentTime: audio.currentTime,
          duration: audio.duration || 0,
          audioUrl: audio.src
        });
      };

      const endedHandler = () => {
        this.stopTickLoop();
        this.notify(false);
        eventBus.emit('AUDIO_SYNC_EVENT', {
          event: 'ended',
          currentSpokenText: this.currentSpokenText,
          currentTime: audio.currentTime,
          duration: audio.duration || 0,
          audioUrl: audio.src
        });
      };

      audio.addEventListener('play', playHandler);
      audio.addEventListener('pause', pauseHandler);
      audio.addEventListener('ended', endedHandler);
      if (!audio.paused) {
        playHandler();
      }
    }
  }

  private static stopAnalysis() {
    this.isAnalyzing = false;
    this.stopTickLoop();
  }

  static async speak(text: string, mood?: Partial<MoodState>, tone?: { pitch: number; speed: number; emotionalBias: string }, force = false) {
    if ((!this.enabled && !force) || !text) return;
    
    this.stop();
    
    // Remove animation cues and asterisk-wrapped actions before speaking
    const cleanText = text
      .replace(/\[[A-Z_]+(?::[^\]]+)?\]/g, '') // Remove [WAVE]
      .replace(/\*+.*?\*+/g, '')               // Remove *waves* or **smiles**
      .replace(/\(.*?\)/g, '')                 // Remove (smiles)
      .replace(/\s+/g, ' ')
      .trim();
    
    if (!cleanText) return;

    this.currentSpokenText = cleanText;
    
    // Resume context if needed (browser requires user interaction which we assume happened as this is called via button click or similar)
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try { await this.audioContext.resume(); } catch (e) {}
    }

    const settings = await StorageService.getModularSettings();
    const providerId = settings.ttsProvider || 'browser';
    const ttsModule = SystemRegistry.getTTS(providerId);

    const lang = SpeechService.detectLanguage(cleanText);

    // Dynamic pitch integration based on mood.joy and mood.stress
    let activeMood: Partial<MoodState> | undefined = mood;
    if (!activeMood) {
      try {
        const state = await StorageService.getAgentState();
        if (state && state.mood) {
          activeMood = state.mood;
        }
      } catch (err) {
        console.warn("[SpeechService] Failed to load agent state for dynamic pitch calculation:", err);
      }
    }

    const joy = activeMood?.joy ?? 50;
    const stress = activeMood?.stress ?? 0;

    // Base pitch from tone or falling back to a sweet natural default 1.15
    const basePitch = tone?.pitch ?? 1.15;
    
    // Dynamic formula:
    // Joy ranges 0-100: -0.15 (at 0 joy) to +0.15 (at 100 joy)
    // Stress ranges 0-100: 0 (at 0 stress) to +0.15 (at 100 stress due to tense high-vibe pitch)
    const joyFactor = (joy - 50) * 0.003;
    const stressFactor = (stress / 100) * 0.15;
    const calculatedPitch = Math.max(0.7, Math.min(1.5, basePitch + joyFactor + stressFactor));

    console.log(`[SpeechService] Dynamic Pitch Adjustment: joy=${joy}, stress=${stress} => calculatedPitch=${calculatedPitch.toFixed(3)}`);

    const ttsSelector = SystemRegistry.getModule<CortexModule>('tts-selector');

    if (ttsSelector) {
      this.notify(true);
      try {
        await ttsSelector.run(cleanText, {} as AgentState, { 
          lang,
          mood: activeMood,
          provider: providerId,
          pitch: calculatedPitch,
          speed: tone?.speed
        });
      } finally {
        this.notify(false);
      }
    } else {
      // Emergency Fallback if registry fails
      this.speakBrowser(cleanText, activeMood, {
        pitch: calculatedPitch,
        speed: tone?.speed ?? 1.0,
        emotionalBias: tone?.emotionalBias || ''
      });
    }
  }

  public static detectLanguage(text: string): string {
    // Japanese often contains Hiragana/Katakana or Kanji in a specific range
    const jpRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
    if (jpRegex.test(text)) return 'ja-JP';

    // Indonesian keywords
    const idKeywords = /\b(yang|dan|di|ini|adalah|saya|kamu|kita|mereka|dengan|untuk|pada|dari|oleh|ke|juga|bisa|ada|tidak|sudah|kalau|akan|itu|anda|kami|banget|kok|sih|deh|kan|yah)\b/i;
    
    // English keywords
    const enKeywords = /\b(the|and|is|it|you|that|was|for|on|are|with|as|at|be|this|have|from|what|all|were|but|not|when|your|can|said|there|use|an|each|which|she|do|how|their|if|will|up|other|about|out|then|them|these|so|some|her|would|make|like|him|into|time|has|look|two|more|write|go|see|number|no|way|could|people|my|than|first|water|been|call|who|oil|its|now|find)\b/i;

    if (idKeywords.test(text)) return 'id-ID';
    if (enKeywords.test(text)) return 'en-US';
    
    return 'id-ID'; // Default to Indonesian for Yuihime context
  }

  private static speakBrowser(text: string, mood?: Partial<MoodState>, tone?: { pitch: number; speed: number; emotionalBias: string }) {
    this.getSynth().cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Store reference on window to prevent GC issues
    (window as any)._activeSpeechUtterance = utterance;
    
    const lang = this.detectLanguage(text);
    utterance.lang = lang;

    // Pick a voice for the detected language if possible
    const voices = this.getSynth().getVoices();
    const langVoice = voices.find(v => v.lang.startsWith(lang.split('-')[0])) || this.voice;
    if (langVoice) utterance.voice = langVoice;

    // Default prosody
    let pitch = tone?.pitch ?? 1.1;
    let rate = tone?.speed ?? 1.0;

    // Mood-based prosody if no explicit tone provided
    if (!tone && mood) {
      if (mood.excitement > 50) {
        pitch = 1.4;
        rate = 1.2;
      } else if (mood.joy > 70) {
        pitch = 1.2;
        rate = 1.1;
      } else if (mood.sadness > 40) {
        pitch = 0.8;
        rate = 0.85;
      } else if (mood.anger > 40) {
        pitch = 0.9;
        rate = 1.15;
      } else if (mood.embarrassment > 50) {
        pitch = 1.3;
        rate = 0.95;
      }
    }

    utterance.pitch = pitch;
    utterance.rate = rate;
    utterance.volume = 1.0;

    utterance.onstart = () => {
      this.notify(true);
      const estimatedDuration = Math.max(1.5, text.length / 15);
      this.startTickLoop(undefined, estimatedDuration * 1000);
      
      eventBus.emit('AUDIO_SYNC_EVENT', {
        event: 'play',
        currentSpokenText: text,
        currentTime: 0,
        duration: estimatedDuration
      });
    };
    utterance.onend = () => {
      (window as any)._activeSpeechUtterance = null;
      this.stopTickLoop();
      this.notify(false);
      
      const estimatedDuration = Math.max(1.5, text.length / 15);
      eventBus.emit('AUDIO_SYNC_EVENT', {
        event: 'ended',
        currentSpokenText: text,
        currentTime: estimatedDuration,
        duration: estimatedDuration
      });
    };
    utterance.onerror = () => {
      (window as any)._activeSpeechUtterance = null;
      this.stopTickLoop();
      this.notify(false);
      
      eventBus.emit('AUDIO_SYNC_EVENT', {
        event: 'ended',
        currentSpokenText: text,
        currentTime: 0,
        duration: 0
      });
    };

    this.getSynth().speak(utterance);
  }

  static stop() {
    this.getSynth().cancel();
    if (this.activeAudio) {
      try {
        const audio = this.activeAudio;
        audio.pause();
        audio.currentTime = 0;
        
        eventBus.emit('AUDIO_SYNC_EVENT', {
          event: 'stop',
          currentSpokenText: this.currentSpokenText,
          currentTime: 0,
          duration: audio.duration || 0,
          audioUrl: audio.src
        });
      } catch (err) {}
      this.activeAudio = null;
    } else {
      eventBus.emit('AUDIO_SYNC_EVENT', {
        event: 'stop',
        currentSpokenText: this.currentSpokenText,
        currentTime: 0,
        duration: 0
      });
    }
    this.stopAnalysis();
    this.stopTickLoop();
    this.notify(false);
  }
}
